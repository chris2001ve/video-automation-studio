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
}

// ---------- motor ----------
let engine: BatchEngine;
let emitTimer: NodeJS.Timeout | null = null;
function emitState() {
  if (emitTimer) return;
  emitTimer = setTimeout(() => {
    emitTimer = null;
    win?.webContents.send('state', engine.snapshot(!!settings.proxyUrl));
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
    // Modo demo: no hay video real; se guarda solo el archivo de metadatos.
    const file = path.join(dir, outputFileName(ts, job.index, job.variant, job.prompt, 'demo.json'));
    fs.writeFileSync(file, JSON.stringify({ ...meta, demo: true }, null, 2));
    return file;
  }
  const file = path.join(dir, outputFileName(ts, job.index, job.variant, job.prompt));
  const res = await undiciFetch(url, { dispatcher, signal: AbortSignal.timeout(300_000) });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const tmp = file + '.part';
  await pipeline(Readable.fromWeb(res.body as any), fs.createWriteStream(tmp));
  fs.renameSync(tmp, file);
  fs.writeFileSync(file.replace(/\.mp4$/, '.json'), JSON.stringify(meta, null, 2));
  return file;
}

function providerFor(id: ProviderId) {
  return createProvider(id, id === 'mock' ? '' : secrets.get(id), netFetch);
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

// ---------- ventana ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1100, minHeight: 720,
    backgroundColor: '#07111f',
    title: 'Video Automation Studio',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  if (isDev) win.loadURL(process.env.VITE_DEV_SERVER_URL!);
  else win.loadFile(path.join(__dirname, '../dist/index.html'));
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.handle('init', () => ({
    settings, state: engine.snapshot(!!settings.proxyUrl), logs: logs.slice(-500),
    keys: secrets.status(), secureStorage: secrets.isSecure(), version: app.getVersion(), providers: PROVIDER_LABELS,
  }));
  ipcMain.handle('settings:save', (_e, patch: Partial<Settings>) => {
    const proxyChanged = patch.proxyUrl !== undefined && patch.proxyUrl !== settings.proxyUrl;
    settings = { ...settings, ...patch };
    settingsFile.write(settings, 100);
    if (proxyChanged) { applyProxy(); log('info', settings.proxyUrl ? `Proxy activo: ${settings.proxyUrl}` : 'Conexión directa (sin proxy)'); }
    if (patch.parallel !== undefined) engine.pump();
    emitState();
    return settings;
  });
  ipcMain.handle('keys:set', (_e, name: 'fal' | 'byteplus' | 'gemini', value: string) => {
    secrets.set(name, value.trim());
    log('info', `API key de ${name} ${value ? 'guardada' : 'eliminada'}`);
    return secrets.status();
  });
  ipcMain.handle('provider:test', async (_e, id: ProviderId) => {
    try { return { ok: true, message: await providerFor(id).testConnection() }; }
    catch (e: any) { return { ok: false, message: e?.message ?? String(e) }; }
  });
  ipcMain.handle('dialog:folder', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'], defaultPath: settings.outputDir });
    if (r.canceled || !r.filePaths[0]) return null;
    settings = { ...settings, outputDir: r.filePaths[0] };
    settingsFile.write(settings, 100);
    return r.filePaths[0];
  });
  ipcMain.handle('dialog:import', async (_e, onePerLine: boolean) => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: [{ name: 'Prompts', extensions: ['txt', 'csv'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const f = r.filePaths[0];
    const items = importText(f, fs.readFileSync(f, 'utf8'), onePerLine);
    log('info', `Importados ${items.length} prompt(s) de ${path.basename(f)}`);
    return { fileName: path.basename(f), items };
  });
  ipcMain.handle('shell:open', (_e, p: string) => shell.openPath(p));
  ipcMain.handle('shell:reveal', (_e, p: string) => { shell.showItemInFolder(p); });
  ipcMain.handle('shell:openFolder', () => { fs.mkdirSync(settings.outputDir, { recursive: true }); return shell.openPath(settings.outputDir); });

  ipcMain.handle('queue:enqueue', (_e, items: PromptItem[], params: GenerationParams, variants: number) => engine.enqueue(items, params, variants).length);
  ipcMain.handle('queue:start', () => engine.start());
  ipcMain.handle('queue:pause', () => engine.pause());
  ipcMain.handle('queue:resume', () => engine.resume());
  ipcMain.handle('queue:stop', () => engine.stop());
  ipcMain.handle('job:retry', (_e, id: string) => engine.retry(id));
  ipcMain.handle('job:retryFailed', () => engine.retryFailed());
  ipcMain.handle('job:cancel', (_e, id: string) => engine.cancel(id));
  ipcMain.handle('job:duplicate', (_e, id: string) => engine.duplicate(id));
  ipcMain.handle('job:remove', (_e, id: string) => engine.remove(id));
  ipcMain.handle('queue:clearFinished', () => engine.clearFinished());
  ipcMain.handle('queue:clearAll', () => engine.clearAll());

  ipcMain.handle('gemini:enhance', async (_e, prompts: string[]) => {
    try {
      const out = await enhancePrompts(prompts, secrets.get('gemini'), settings.geminiModel, netFetch);
      log('success', `Gemini mejoró ${out.length} prompt(s)`);
      return { ok: true, prompts: out };
    } catch (e: any) {
      log('error', `Gemini: ${e?.message ?? e}`);
      return { ok: false, message: e?.message ?? String(e) };
    }
  });
  ipcMain.handle('logs:export', async (_e, text: string) => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: `registros-${new Date().toISOString().slice(0, 10)}.txt` });
    if (r.canceled || !r.filePath) return false;
    fs.writeFileSync(r.filePath, text);
    return true;
  });
  ipcMain.handle('logs:clear', () => { logs.length = 0; });
}

app.whenReady().then(() => {
  settings = loadSettings();
  secrets = new SecretStore(path.join(dataDir, 'secrets.json'));
  applyProxy();
  initEngine();
  registerIpc();
  createWindow();
  log('info', `Video Automation Studio ${app.getVersion()} listo · ${settings.proxyUrl ? 'proxy activo' : 'conexión directa'}`);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => { queueFile.flush(); settingsFile.flush(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
