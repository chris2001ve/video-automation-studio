import { BatchEngine } from '../core/engine';
import { MockProvider } from '../core/providers/mock';
import { DEFAULT_SETTINGS, type LogEntry, type Settings } from '../core/types';
import { outputFileName } from '../core/util';
import type { StudioApi } from './api';

/** Implementación para navegador (vista previa de la interfaz). Solo usa el proveedor simulado. */
export function createBrowserApi(): StudioApi {
  let settings: Settings = { ...DEFAULT_SETTINGS, provider: 'mock', outputDir: '~/Videos/Video Automation Studio' };
  const logs: LogEntry[] = [];
  const stateCbs = new Set<(s: any) => void>();
  const logCbs = new Set<(l: LogEntry) => void>();
  const provider = new MockProvider(Date.now, 9000, 0.15);
  const log = (level: LogEntry['level'], message: string) => {
    const e = { ts: Date.now(), level, message }; logs.push(e); logCbs.forEach((c) => c(e));
  };
  const engine: BatchEngine = new BatchEngine({
    getProvider: () => provider,
    download: async (_u, job) => `${settings.outputDir}/${outputFileName(Date.now(), job.index, job.variant, job.prompt, 'demo.json')}`,
    persist: () => {},
    log,
    changed: () => { const s = engine.snapshot(false); stateCbs.forEach((c) => c(s)); },
    config: () => ({ parallel: settings.parallel, maxRetries: settings.maxRetries, pollIntervalSec: 1, requestsPerMinute: settings.requestsPerMinute, backoffBaseMs: 800 }),
  }, [], { allTime: 65, byDay: {} });
  log('info', 'Vista previa en navegador: se usa el proveedor simulado (sin API real)');
  const ok = async () => {};
  return {
    init: async () => ({ settings, state: engine.snapshot(false), logs: [...logs], keys: { fal: false, byteplus: false, gemini: false }, secureStorage: false, version: '1.0.0', providers: { fal: 'fal.ai', byteplus: 'BytePlus ModelArk', mock: 'Demo (simulado)' } }),
    saveSettings: async (p) => { settings = { ...settings, ...p }; engine.pump(); return settings; },
    setKey: async () => ({ fal: false, byteplus: false, gemini: false }),
    testProvider: async () => ({ ok: true, message: 'Modo demo activo' }),
    chooseFolder: async () => null,
    importFile: async () => null,
    openPath: ok, reveal: ok, openOutputFolder: ok,
    enqueue: async (items, params, v) => engine.enqueue(items, { ...params, provider: 'mock' }, v).length,
    start: async () => engine.start(), pause: async () => engine.pause(), resume: async () => engine.resume(), stop: async () => engine.stop(),
    retry: async (id) => engine.retry(id), retryFailed: async () => engine.retryFailed(), cancel: (id) => engine.cancel(id),
    duplicate: async (id) => engine.duplicate(id), remove: async (id) => engine.remove(id),
    clearFinished: async () => engine.clearFinished(), clearAll: async () => engine.clearAll(),
    enhance: async () => ({ ok: false, message: 'Gemini solo está disponible en la app de escritorio' }),
    exportLogs: async () => false, clearLogs: async () => { logs.length = 0; },
    onState: (cb) => { stateCbs.add(cb); return () => stateCbs.delete(cb); },
    onLog: (cb) => { logCbs.add(cb); return () => logCbs.delete(cb); },
  };
}
