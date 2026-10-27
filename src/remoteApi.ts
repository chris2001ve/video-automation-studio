// Cliente para controlar la app de escritorio desde el celular (misma red Wi-Fi).
// La interfaz es la misma; las acciones viajan por HTTP al PC y los cambios llegan en tiempo real (SSE).
import type { EngineState, LogEntry, Settings } from '../core/types';
import type { InitData, KeyName, StudioApi } from './api';

const TOKEN_KEY = 'vas-remote-token';

export class RemoteAuthError extends Error {
  constructor(message = 'Código de acceso incorrecto') { super(message); this.name = 'RemoteAuthError'; }
}

export function getRemoteToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}
export function setRemoteToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t.trim().toUpperCase());
}

/** Lee el código del QR (#k=XXXX-XXXX), lo guarda y lo quita de la barra de direcciones. */
function takeTokenFromUrl() {
  const m = /[#&?]k=([A-Za-z0-9-]+)/.exec(location.hash || location.search);
  if (m) {
    setRemoteToken(decodeURIComponent(m[1]));
    history.replaceState(null, '', location.pathname);
  }
}

/** ¿Esta página la está sirviendo la app de escritorio? Devuelve el nombre del PC o null. */
export async function detectRemote(): Promise<string | null> {
  if (!/^https?:$/.test(location.protocol)) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch('./api/ping', { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    if (j?.app !== 'video-automation-studio') return null;
    takeTokenFromUrl();
    return String(j.host ?? 'PC');
  } catch {
    return null;
  }
}

type Listener<T> = Set<(v: T) => void>;

export function createRemoteApi(host: string): StudioApi {
  const state: Listener<EngineState> = new Set();
  const log: Listener<LogEntry> = new Set();
  const settingsL: Listener<Settings> = new Set();
  const keysL: Listener<Record<KeyName, boolean>> = new Set();
  const conn: Listener<boolean> = new Set();
  let es: EventSource | null = null;
  let online = false;
  const setOnline = (v: boolean) => { if (v !== online) { online = v; conn.forEach((f) => f(v)); } };

  async function call<T = unknown>(ch: string, ...args: unknown[]): Promise<T> {
    let r: Response;
    try {
      r = await fetch('./api/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getRemoteToken()}` },
        body: JSON.stringify({ ch, args }),
      });
    } catch {
      setOnline(false);
      throw new Error('Sin conexión con el PC. Revisa que la app siga abierta y en la misma Wi-Fi.');
    }
    if (r.status === 401) throw new RemoteAuthError();
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
    setOnline(true);
    return j.result as T;
  }

  function connectEvents() {
    es?.close();
    es = new EventSource(`./api/events?k=${encodeURIComponent(getRemoteToken())}`);
    es.onopen = () => setOnline(true);
    es.onerror = () => setOnline(false); // EventSource reintenta solo
    const parse = (e: MessageEvent) => JSON.parse(e.data);
    es.addEventListener('state', (e) => state.forEach((f) => f(parse(e as MessageEvent))));
    es.addEventListener('log', (e) => log.forEach((f) => f(parse(e as MessageEvent))));
    es.addEventListener('settings', (e) => settingsL.forEach((f) => f(parse(e as MessageEvent))));
    es.addEventListener('keys', (e) => keysL.forEach((f) => f(parse(e as MessageEvent))));
  }

  const sub = <T,>(set: Listener<T>) => (cb: (v: T) => void) => { set.add(cb); return () => { set.delete(cb); }; };

  const pickFile = (accept: string) => new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });

  return {
    async init() {
      const d = await call<InitData>('init');
      connectEvents();
      return { ...d, mode: 'remote', host };
    },
    saveSettings: (patch) => call('settings:save', patch),
    setKey: (name, value) => call('keys:set', name, value),
    testProvider: (id) => call('provider:test', id),
    // En el celular no se puede elegir carpeta del PC.
    chooseFolder: async () => null,
    async importFile(onePerLine) {
      const f = await pickFile('.txt,.csv,text/plain,text/csv');
      if (!f) return null;
      return call('import:text', f.name, await f.text(), onePerLine);
    },
    openPath: async () => null,
    reveal: async () => null,
    openOutputFolder: async () => null,
    enqueue: (items, params, variants) => call('queue:enqueue', items, params, variants),
    start: () => call('queue:start'),
    pause: () => call('queue:pause'),
    resume: () => call('queue:resume'),
    stop: () => call('queue:stop'),
    retry: (id) => call('job:retry', id),
    retryFailed: () => call('job:retryFailed'),
    cancel: (id) => call('job:cancel', id),
    duplicate: (id) => call('job:duplicate', id),
    remove: (id) => call('job:remove', id),
    clearFinished: () => call('queue:clearFinished'),
    clearAll: () => call('queue:clearAll'),
    enhance: (prompts) => call('gemini:enhance', prompts),
    async exportLogs(text) {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `registros-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return true;
    },
    clearLogs: () => call('logs:clear'),
    onState: sub(state),
    onLog: sub(log),
    onSettings: sub(settingsL),
    onKeys: sub(keysL),
    onConnection: sub(conn),
  };
}
