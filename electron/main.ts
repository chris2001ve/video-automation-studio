import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fetch as undiciFetch, ProxyAgent, type Dispatcher } from 'undici';
import { BatchEngine } from '../core/engine';
import { enhancePrompts } from '../core/gemini';
import { importText } from '../core/promptParser';
import { createProvider, PROVIDER_LABELS } from '../core/providers';
import type { FetchFn } from '../core/providers/http';
import { DEFAULT_SETTINGS, type GenerationParams, type Job, type LogEntry, type LogLevel, type PromptItem, type ProviderId, type Settings, type Stats } from '../core/types';
import { outputFileName } from '../core/util';
import { SecretStore } from './secrets';
import { JsonFile } from './storage';
import { newToken, RemoteServer, type Handler } from './remote';

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let win: BrowserWindow | null = null;

// ---------- persistencia ----------
const dataDir = app.getPath('userData');
const settingsFile = new JsonFile<Settings>(path.join(dataDir, 'settings.json'), DEFAULT_SETTINGS);
const queueFile = new JsonFile<{ jobs: Job[]; stats: Stats }>(path.join(dataDir, 'queue.json'), { jobs: [], stats: { allTime: 0, byDay: {} } });
let secrets: SecretStore;

function loadSettings(): Settings {
  const s = settingsFile.read();
  const merged: Settings = {
    ...DEFAULT_SETTINGS, ...s,
    models: { ...DEFAULT_SETTINGS.models, ...s.models },
    selectedModel: { ...DEFAULT_SETTINGS.selectedModel, ...s.selectedModel },
    pricePerSecond: { ...DEFAULT_SETTINGS.pricePerSecond, ...s.pricePerSecond },
    requestsPerMinute: { ...DEFAULT_SETTINGS.requestsPerMinute, ...s.requestsPerMinute },
  };
  if (!merged.outputDir) merged.outputDir = path.join(app.getPath('videos'), 'Video Automation Studio');
  return merged;
}
let settings: Settings;

// ---------- red (con proxy opcional) ----------
let dispatcher: Dispatcher | undefined;
function applyProxy() {
  dispatcher = settings.proxyUrl ? new ProxyAgent(settings.proxyUrl) : undefined;
}
const netFetch: FetchFn = (url, init) =>
  undiciFetch(url, { ...(init as any), dispatcher, signal: AbortSignal.timeout(120_000) }) as unknown as Promise<Response>;

// ---------- registros ----------
const logs: LogEntry[] = [];
function log(level: LogLevel, message: string) {
  const entry = { ts: Date.now(), level, message };
  logs.push(entry);
  if (logs.length > 3000) logs.splice(0, logs.length - 3000);
  win?.webContents.send('log', entry);
  remote?.broadcast('log', entry);
}

// ---------- motor ----------
let engine: BatchEngine;
let emitTimer: NodeJS.Timeout | null = null;
function emitState() {
  if (emitTimer) return;
  emitTimer = setTimeout(() => {
    emitTimer = null;
    const snap = engine.snapshot(!!settings.proxyUrl);
    win?.webContents.send('state', snap);
    remote?.broadcast('state', snap);
  }, 120);
}

async function downloadVideo(url: string | null, job: Job): Promise<string> {
  const dir = settings.outputDir;
  fs.mkdirSync(dir, { recursive: true });
  const ts = Date.now();
  const meta = {
    prompt: job.prompt, params: job.params, taskId: job.taskId, index: job.index, variant: job.variant,
    createdAt: new Date(job.createdAt).toISOString(), savedAt: new Date(ts).toISOString(), sourceUrl: url,
  };
  if (!url) {
    const file = path.join(dir, outputFileName(ts, job.index, job.variant, job.prompt, 'demo.json'));
    fs.writeFileSync(file, JSON.stringify({ ...meta, demo: true }, null, 2));
    return file;
  }
  const file = path.join(dir, outputFileName(ts, job.index, job.variant, job.prompt));
  
  // Headers de descarga autenticada para evitar el error HTTP 402
  const headers: Record<string, string> = {};
  const polliKey = secrets.get('pollinations' as any);
  if (polliKey) {
    headers['Authorization'] = `Bearer ${polliKey}`;
  }

  const res = await undiciFetch(url, { 
    dispatcher, 
    headers, 
    signal: AbortSignal.timeout(300_000) 
  });

  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const tmp = file + '.part';
  await pipeline(Readable.fromWeb(res.body as any), fs.createWriteStream(tmp));
  fs.renameSync(tmp, file);
  fs.writeFileSync(file.replace(/\.mp4$/, '.json'), JSON.stringify(meta, null, 2));
  return file;
}

// Conexión al proveedor: pollinations recibe la clave si existe, o pasa vacía
function providerFor(id: ProviderId) {
  const isFree = id === 'mock';
  const key = isFree ? '' : (secrets.get(id as any) || '');
  return createProvider(id, key, netFetch);
}

function initEngine() {
  const saved = queueFile.read();
  engine = new BatchEngine({
    getProvider: providerFor,
    download: downloadVideo,
    persist: (jobs, stats) => queueFile.write({ jobs, stats }),
    log,
    changed: emitState,
    config: () => ({
      parallel: settings.parallel,
      maxRetries: settings.maxRetries,
      pollIntervalSec: settings.pollIntervalSec,
      requestsPerMinute: settings.requestsPerMinute,
    }),
  }, saved.jobs, saved.stats);
  const resumable = engine.jobs.filter((j) => j.state === 'rendering' && j.taskId).length;
  if (resumable) log('info', `${resumable} tarea(s) en curso recuperadas; pulsa "Iniciar" para retomarlas`);
}

// ---------- ventana maximizada para pantallas de TV ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 720, minWidth: 1024, minHeight: 640,
    backgroundColor: '#07111f',
    title: 'Video Automation Studio',
    autoHideMenuBar: true,
    resizable: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  
  win.maximize();

  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  if (isDev) win.loadURL(process.env.VITE_DEV_SERVER_URL!);
  else win.loadFile(path.join(__dirname, '../dist/index.html'));
}

// ---------- IPC ----------
const DESKTOP_ONLY = new Set(['dialog:folder', 'dialog:import', 'shell:open', 'shell:reveal', 'shell:openFolder', 'logs:export', 'remote:info', 'remote:set', 'remote:regen']);
const REMOTE_PROTECTED_SETTINGS: (keyof Settings)[] = ['remoteEnabled', 'remotePort', 'remoteToken', 'outputDir'];
const handlers: Record<string, Handler> = {};
const handle = (ch: string, fn: Handler) => { handlers[ch] = fn; };

function getAllKeysStatus() {
  return {
    ...secrets.status(),
    pollinations: true, // Reporta siempre activo para no bloquear la UI
  };
}

function broadcastSettings() {
  win?.webContents.send('settings', settings);
  remote?.broadcast('settings', settings);
}
function broadcastKeys() {
  const k = getAllKeysStatus();
  win?.webContents.send('keys', k);
  remote?.broadcast('keys', k);
}

function registerIpc() {
  handle('init', () => ({
    settings, state: engine.snapshot(!!settings.proxyUrl), logs: logs.slice(-500),
    keys: getAllKeysStatus(), secureStorage: secrets.isSecure(), version: app.getVersion(), providers: PROVIDER_LABELS,
  }));
  handle('settings:save', (patch: Partial<Settings>) => {
    const proxyChanged = patch.proxyUrl !== undefined && patch.proxyUrl !== settings.proxyUrl;
    settings = { ...settings, ...patch };
    settingsFile.write(settings, 100);
    if (proxyChanged) { applyProxy(); log('info', settings.proxyUrl ? `Proxy activo: ${settings.proxyUrl}` : 'Conexión directa (sin proxy)'); }
    if (patch.parallel !== undefined) engine.pump();
    emitState();
    broadcastSettings();
    return settings;
  });
  handle('keys:set', (name: 'fal' | 'byteplus' | 'gemini' | 'pollinations', value: string) => {
    secrets.set(name as any, value.trim());
    log('info', `API key de ${name} ${value ? 'guardada' : 'eliminada'}`);
    broadcastKeys();
    return getAllKeysStatus();
  });
  handle('provider:test', async (id: ProviderId) => {
    try { return { ok: true, message: await providerFor(id).testConnection() }; }
    catch (e: any) { return { ok: false, message: e?.message ?? String(e) }; }
  });
  handle('dialog:folder', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'], defaultPath: settings.outputDir });
    if (r.canceled || !r.filePaths[0]) return null;
    settings = { ...settings, outputDir: r.filePaths[0] };
    settingsFile.write(settings, 100);
    return r.filePaths[0];
  });
  handle('dialog:import', async (onePerLine: boolean) => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: [{ name: 'Prompts', extensions: ['txt', 'csv'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const f = r.filePaths[0];
    const items = importText(f, fs.readFileSync(f, 'utf8'), onePerLine);
    log('info', `Importados ${items.length} prompt(s) de ${path.basename(f)}`);
    return { fileName: path.basename(f), items };
  });
  handle('shell:open', (p: string) => shell.openPath(p));
  handle('shell:reveal', (p: string) => { shell.showItemInFolder(p); });
  handle('shell:openFolder', () => { fs.mkdirSync(settings.outputDir, { recursive: true }); return shell.openPath(settings.outputDir); });

  handle('queue:enqueue', (items: PromptItem[], params: GenerationParams, variants: number) => engine.enqueue(items, params, variants).length);
  handle('queue:start', () => engine.start());
  handle('queue:pause', () => engine.pause());
  handle('queue:resume', () => engine.resume());
  handle('queue:stop', () => engine.stop());
  handle('job:retry', (id: string) => engine.retry(id));
  handle('job:retryFailed', () => engine.retryFailed());
  handle('job:cancel', (id: string) => engine.cancel(id));
  handle('job:duplicate', (id: string) => engine.duplicate(id));
  handle('job:remove', (id: string) => engine.remove(id));
  handle('queue:clearFinished', () => engine.clearFinished());
  handle('queue:clearAll', () => engine.clearAll());

  handle('gemini:enhance', async (prompts: string[]) => {
    try {
      const out = await enhancePrompts(prompts, secrets.get('gemini'), settings.geminiModel, netFetch);
      log('success', `Gemini mejoró ${out.length} prompt(s)`);
      return { ok: true, prompts: out };
    } catch (e: any) {
      log('error', `Gemini: ${e?.message ?? e}`);
      return { ok: false, message: e?.message ?? String(e) };
    }
  });
  handle('logs:export', async (text: string) => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: `registros-${new Date().toISOString().slice(0, 10)}.txt` });
    if (r.canceled || !r.filePath) return false;
    fs.writeFileSync(r.filePath, text);
    return true;
  });
  handle('logs:clear', () => { logs.length = 0; });

  handle('import:text', (fileName: string, content: string, onePerLine: boolean) => {
    const name = path.basename(String(fileName || 'prompts.txt'));
    const items = importText(name, String(content ?? ''), !!onePerLine);
    log('info', `Importados ${items.length} prompt(s) de ${name} (desde el celular)`);
    return { fileName: name, items };
  });

  // ----- control remoto -----
  handle('remote:info', () => remoteInfo());
  handle('remote:set', async (patch: { enabled?: boolean; port?: number }) => {
    const port = Math.round(Number(patch?.port ?? settings.remotePort));
    settings = {
      ...settings,
      remoteEnabled: patch?.enabled ?? settings.remoteEnabled,
      remotePort: port >= 1024 && port <= 65535 ? port : settings.remotePort,
    };
    settingsFile.write(settings, 100);
    await applyRemote();
    broadcastSettings();
    return remoteInfo();
  });
  handle('remote:regen', () => {
    settings = { ...settings, remoteToken: newToken() };
    settingsFile.write(settings, 100);
    remote.kickAll();
    log('info', 'Nuevo código de acceso remoto generado; los celulares deben volver a conectarse');
    win?.webContents.send('remote', remoteInfo());
    return remoteInfo();
  });

  for (const [ch, fn] of Object.entries(handlers)) ipcMain.handle(ch, (_e, ...args) => fn(...args));
}

// ---------- control remoto (celular en la misma Wi-Fi) ----------
let remote: RemoteServer;
function remoteHandlers(): Record<string, Handler> {
  const out: Record<string, Handler> = {};
  for (const [ch, fn] of Object.entries(handlers)) if (!DESKTOP_ONLY.has(ch)) out[ch] = fn;
  out['settings:save'] = (patch: Partial<Settings>) => {
    const clean = { ...(patch ?? {}) } as Partial<Settings>;
    for (const k of REMOTE_PROTECTED_SETTINGS) delete clean[k];
    return handlers['settings:save'](clean);
  };
  return out;
}
function remoteInfo() { return remote.info(settings.remoteEnabled, settings.remoteToken); }
async function applyRemote() {
  if (settings.remoteEnabled) {
    await remote.start(settings.remotePort);
    const info = remoteInfo();
    if (info.running) log('success', `Control desde el celular activo: ${info.urls[0] ?? `puerto ${info.port}`}`);
    else log('error', `No se pudo activar el control remoto: ${info.error}`);
  } else if (remote.running) {
    await remote.stop();
    log('info', 'Control desde el celular desactivado');
  }
  win?.webContents.send('remote', remoteInfo());
}
function initRemote() {
  if (!settings.remoteToken) { settings = { ...settings, remoteToken: newToken() }; settingsFile.write(settings, 100); }
  remote = new RemoteServer({
    staticDir: path.join(__dirname, '../dist'),
    handlers: remoteHandlers(),
    getToken: () => settings.remoteToken,
    appName: 'Video Automation Studio',
    onClient: (ev, ip) => {
      log('info', ev === 'connect' ? `Celular conectado (${ip})` : `Celular desconectado (${ip})`);
      win?.webContents.send('remote', remoteInfo());
    },
  });
  void applyRemote();
}

app.whenReady().then(() => {
  settings = loadSettings();
  secrets = new SecretStore(path.join(dataDir, 'secrets.json'));
  applyProxy();
  initEngine();
  registerIpc();
  createWindow();
  initRemote();
  log('info', `Video Automation Studio ${app.getVersion()} listo · ${settings.proxyUrl ? 'proxy activo' : 'conexión directa'}`);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => { queueFile.flush(); settingsFile.flush(); void remote?.stop(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
