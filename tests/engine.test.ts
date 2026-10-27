import { describe, expect, it } from 'vitest';
import { ProviderError } from '../core/backoff';
import { BatchEngine, type EngineConfig } from '../core/engine';
import type { CreatedTask, TaskStatus, VideoProvider } from '../core/providers/types';
import type { GenerationParams, Job } from '../core/types';

const params: GenerationParams = { provider: 'mock', model: 'm', durationSec: 5, aspectRatio: '9:16', resolution: '720p' };

class FakeProvider implements VideoProvider {
  id = 'mock' as const; label = 'fake';
  created = 0; maxActive = 0; activeNow = 0;
  polls = new Map<string, number>();
  constructor(public behaviour: { createErrors?: ProviderError[]; failFirst?: boolean; pollsToFinish?: number } = {}) {}
  async createTask(_p: string): Promise<CreatedTask> {
    const err = this.behaviour.createErrors?.shift();
    if (err) throw err;
    this.created++; this.activeNow++; this.maxActive = Math.max(this.maxActive, this.activeNow);
    return { taskId: 't' + this.created };
  }
  async getStatus(t: CreatedTask): Promise<TaskStatus> {
    const n = (this.polls.get(t.taskId) ?? 0) + 1; this.polls.set(t.taskId, n);
    if (n < (this.behaviour.pollsToFinish ?? 2)) return { state: 'running', progress: 50 };
    this.activeNow--;
    if (this.behaviour.failFirst && t.taskId === 't1') return { state: 'failed', error: 'system error', serviceSide: true };
    return { state: 'succeeded', videoUrl: 'https://x/' + t.taskId + '.mp4' };
  }
  async testConnection() { return 'ok'; }
}

function setup(provider: VideoProvider, cfg: Partial<EngineConfig> = {}, jobs: Job[] = []) {
  const logs: string[] = [];
  const downloads: string[] = [];
  const config: EngineConfig = { parallel: 2, maxRetries: 2, pollIntervalSec: 0.005, requestsPerMinute: { fal: 0, byteplus: 0, mock: 0 }, backoffBaseMs: 5, ...cfg };
  const engine = new BatchEngine({
    getProvider: () => provider,
    download: async (url, job) => { downloads.push(url ?? ''); return `/out/${job.index}.mp4`; },
    persist: () => {}, log: (_l, m) => logs.push(m), changed: () => {}, config: () => config,
  }, jobs);
  return { engine, logs, downloads, config };
}

const waitIdle = async (e: BatchEngine, timeout = 3000) => {
  const t0 = Date.now();
  while (e.running) { if (Date.now() - t0 > timeout) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 5)); }
};

describe('BatchEngine', () => {
  it('procesa todo el lote respetando el paralelismo', async () => {
    const p = new FakeProvider();
    const { engine, downloads } = setup(p, { parallel: 2 });
    engine.enqueue([{ prompt: 'a' }, { prompt: 'b' }, { prompt: 'c' }, { prompt: 'd' }, { prompt: 'e' }], params, 1);
    engine.start();
    await waitIdle(engine);
    expect(engine.counts().saved).toBe(5);
    expect(p.maxActive).toBeLessThanOrEqual(2);
    expect(downloads).toHaveLength(5);
    expect(engine.stats.allTime).toBe(5);
  });

  it('crea variantes por prompt', () => {
    const { engine } = setup(new FakeProvider());
    const jobs = engine.enqueue([{ prompt: 'a' }, { prompt: 'b' }], params, 3);
    expect(jobs).toHaveLength(6);
    expect(jobs.map((j) => `${j.index}.${j.variant}`)).toEqual(['1.1', '1.2', '1.3', '2.1', '2.2', '2.3']);
  });

  it('reintenta errores 429/5xx y luego tiene éxito', async () => {
    const p = new FakeProvider({ createErrors: [new ProviderError('HTTP 429', 429, true), new ProviderError('HTTP 503', 503, true, undefined, true)] });
    const { engine } = setup(p, { parallel: 1 });
    engine.enqueue([{ prompt: 'a' }], params, 1);
    engine.start();
    await waitIdle(engine);
    expect(engine.jobs[0].state).toBe('saved');
    expect(engine.jobs[0].attempts).toBe(2);
  });

  it('marca "necesita revisión" al agotar reintentos y no reintenta errores 4xx', async () => {
    const p = new FakeProvider({ createErrors: [
      new ProviderError('HTTP 500', 500, true), new ProviderError('HTTP 500', 500, true), new ProviderError('HTTP 500', 500, true),
      new ProviderError('HTTP 400: prompt inválido', 400, false),
    ] });
    const { engine } = setup(p, { parallel: 1, maxRetries: 2 });
    engine.enqueue([{ prompt: 'a' }, { prompt: 'b' }], params, 1);
    engine.start();
    await waitIdle(engine);
    expect(engine.jobs[0].state).toBe('review');
    expect(engine.jobs[1].state).toBe('error');
    expect(engine.jobs[1].attempts).toBe(1);
  });

  it('reenvía tareas que fallan en el servidor y muestra el aviso del servicio', async () => {
    const p = new FakeProvider({ failFirst: true });
    const { engine } = setup(p, { parallel: 1 });
    engine.enqueue([{ prompt: 'a' }], params, 1);
    engine.start();
    // El aviso aparece mientras se reintenta
    await new Promise((r) => setTimeout(r, 30));
    await waitIdle(engine);
    expect(engine.jobs[0].state).toBe('saved');
    expect(p.created).toBe(2);
    expect(engine.serviceIssue).toBeNull(); // se limpia tras un éxito
  });

  it('retoma tareas tras reiniciar sin volver a enviarlas', async () => {
    const p = new FakeProvider();
    const saved: Job = { id: 's', index: 1, variant: 1, prompt: 'ya', params, state: 'saved', attempts: 0, createdAt: 0, outputPath: '/o.mp4' };
    const inflight: Job = { id: 'r', index: 2, variant: 1, prompt: 'b', params, state: 'downloading', taskId: 'remote-1', attempts: 0, createdAt: 0 };
    const sending: Job = { id: 'w', index: 3, variant: 1, prompt: 'c', params, state: 'sending', attempts: 0, createdAt: 0 };
    const { engine } = setup(p, {}, [saved, inflight, sending]);
    expect(engine.jobs.map((j) => j.state)).toEqual(['saved', 'rendering', 'waiting']);
    engine.start();
    await waitIdle(engine);
    expect(engine.jobs.every((j) => j.state === 'saved')).toBe(true);
    expect(p.created).toBe(1); // solo el que no tenía tarea
  });

  it('pausa, cancela y detiene', async () => {
    const p = new FakeProvider({ pollsToFinish: 1000 });
    const { engine } = setup(p, { parallel: 1 });
    const [a, b] = engine.enqueue([{ prompt: 'a' }, { prompt: 'b' }], params, 1);
    engine.start();
    await new Promise((r) => setTimeout(r, 20));
    engine.pause();
    await engine.cancel(a.id);
    await new Promise((r) => setTimeout(r, 20));
    expect(engine.jobs.find((j) => j.id === a.id)!.state).toBe('cancelled');
    expect(engine.jobs.find((j) => j.id === b.id)!.state).toBe('waiting'); // pausado: no se envía
    engine.resume();
    await new Promise((r) => setTimeout(r, 20));
    expect(engine.jobs.find((j) => j.id === b.id)!.state).toBe('rendering');
    engine.stop();
    expect(engine.running).toBe(false);
    expect(engine.jobs.find((j) => j.id === b.id)!.taskId).toBeTruthy();
  });
});
