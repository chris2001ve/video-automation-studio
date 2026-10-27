import { ProviderError, RateLimiter, backoffDelay } from './backoff';
import type { CreatedTask, VideoProvider } from './providers/types';
import type { EngineState, GenerationParams, Job, LogLevel, ProviderId, PromptItem, ServiceIssue, Stats } from './types';
import { dayKey, uid } from './util';

export interface EngineConfig {
  parallel: number;
  maxRetries: number;
  pollIntervalSec: number;
  requestsPerMinute: Record<ProviderId, number>;
  backoffBaseMs?: number;
}

export interface EngineDeps {
  getProvider(id: ProviderId): VideoProvider;
  /** Descarga el video (o escribe el resultado demo) y devuelve la ruta del archivo. */
  download(url: string | null, job: Job): Promise<string>;
  persist(jobs: Job[], stats: Stats): void;
  log(level: LogLevel, message: string): void;
  changed(): void;
  config(): EngineConfig;
  now?: () => number;
}

const TERMINAL: Job['state'][] = ['saved', 'review', 'cancelled', 'error'];
const MAX_POLL_ERRORS = 12;

export class BatchEngine {
  jobs: Job[] = [];
  stats: Stats = { allTime: 0, byDay: {} };
  running = false;
  paused = false;
  serviceIssue: ServiceIssue | null = null;
  private active = new Set<string>();
  private runToken = 0;
  private wakers = new Set<() => void>();
  private limiters = new Map<ProviderId, RateLimiter>();
  private now: () => number;

  constructor(private deps: EngineDeps, initialJobs: Job[] = [], stats?: Stats) {
    this.now = deps.now ?? Date.now;
    if (stats) this.stats = stats;
    // Recuperación tras reinicio: lo que estaba "enviando" sin id vuelve a la espera;
    // lo que tenía tarea creada se seguirá consultando sin reenviar (no se duplican videos).
    this.jobs = initialJobs.map((j) => {
      if (j.state === 'sending' && !j.taskId) return { ...j, state: 'waiting' };
      if ((j.state === 'sending' || j.state === 'rendering' || j.state === 'downloading') && j.taskId) return { ...j, state: 'rendering' };
      return j;
    });
  }

  // ---------- estado ----------
  snapshot(proxy = false): EngineState {
    return {
      jobs: this.jobs.map((j) => ({ ...j })),
      running: this.running,
      paused: this.paused,
      stats: this.stats,
      serviceIssue: this.serviceIssue,
      connection: { proxy },
    };
  }

  counts() {
    const c = { saved: 0, active: 0, failed: 0, pending: 0, total: this.jobs.length };
    for (const j of this.jobs) {
      if (j.state === 'saved') c.saved++;
      else if (j.state === 'error' || j.state === 'review') c.failed++;
      else if (j.state === 'waiting') c.pending++;
      else if (j.state !== 'cancelled') c.active++;
    }
    return c;
  }

  private touch() {
    this.deps.persist(this.jobs, this.stats);
    this.deps.changed();
  }

  private update(job: Job, patch: Partial<Job>) {
    Object.assign(job, patch);
    this.touch();
  }

  // ---------- gestión de la cola ----------
  enqueue(items: PromptItem[], base: GenerationParams, variants: number): Job[] {
    const startIndex = this.jobs.reduce((m, j) => Math.max(m, j.index), 0);
    const created: Job[] = [];
    items.forEach((item, i) => {
      for (let v = 1; v <= Math.max(1, variants); v++) {
        created.push({
          id: uid(),
          index: startIndex + i + 1,
          variant: v,
          prompt: item.prompt,
          params: {
            ...base,
            durationSec: item.durationSec ?? base.durationSec,
            aspectRatio: item.aspectRatio ?? base.aspectRatio,
            negativePrompt: [base.negativePrompt, item.negativePrompt].filter(Boolean).join(', ') || undefined,
          },
          state: 'waiting',
          attempts: 0,
          createdAt: this.now(),
        });
      }
    });
    this.jobs.push(...created);
    this.deps.log('info', `${created.length} video(s) agregados a la cola`);
    this.touch();
    if (this.running) this.pump();
    return created;
  }

  start() {
    if (this.running && !this.paused) return;
    if (!this.running) this.runToken++;
    this.running = true;
    this.paused = false;
    this.deps.log('info', 'Generación por lotes iniciada');
    this.touch();
    this.pump();
  }

  pause() {
    if (!this.running) return;
    this.paused = true;
    this.deps.log('warn', 'Pausado: los videos activos terminarán, no se enviarán nuevos');
    this.touch();
  }

  resume() { this.start(); }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.paused = false;
    this.runToken++;
    this.wakeAll();
    this.deps.log('warn', 'Generación detenida. Las tareas ya enviadas se retomarán al iniciar de nuevo.');
    this.touch();
  }

  retry(id: string) {
    const j = this.jobs.find((x) => x.id === id);
    if (!j || this.active.has(id)) return;
    this.update(j, { state: 'waiting', attempts: 0, error: undefined, taskId: undefined, statusUrl: undefined, responseUrl: undefined, progress: undefined, outputPath: undefined });
    if (this.running) this.pump(); else this.start();
  }

  retryFailed() {
    for (const j of this.jobs) if ((j.state === 'error' || j.state === 'review') && !this.active.has(j.id)) {
      Object.assign(j, { state: 'waiting', attempts: 0, error: undefined, taskId: undefined, statusUrl: undefined, responseUrl: undefined, progress: undefined });
    }
    this.touch();
    if (this.running) this.pump(); else this.start();
  }

  async cancel(id: string) {
    const j = this.jobs.find((x) => x.id === id);
    if (!j || TERMINAL.includes(j.state)) return;
    const task = j.taskId ? this.taskOf(j) : null;
    this.update(j, { state: 'cancelled', finishedAt: this.now() });
    this.deps.log('warn', `#${j.index} cancelado`);
    this.wakeAll();
    if (task) await this.deps.getProvider(j.params.provider).cancel?.(task).catch(() => {});
  }

  duplicate(id: string) {
    const j = this.jobs.find((x) => x.id === id);
    if (!j) return;
    const copy: Job = {
      id: uid(), index: this.jobs.reduce((m, x) => Math.max(m, x.index), 0) + 1, variant: 1,
      prompt: j.prompt, params: { ...j.params }, state: 'waiting', attempts: 0, createdAt: this.now(),
    };
    this.jobs.push(copy);
    this.touch();
    if (this.running) this.pump();
  }

  remove(id: string) {
    if (this.active.has(id)) return;
    this.jobs = this.jobs.filter((j) => j.id !== id);
    this.touch();
  }

  clearFinished() {
    this.jobs = this.jobs.filter((j) => this.active.has(j.id) || !TERMINAL.includes(j.state));
    this.touch();
  }

  clearAll() {
    if (this.running) return;
    this.jobs = this.jobs.filter((j) => this.active.has(j.id));
    this.touch();
  }

  // ---------- motor ----------
  private limiter(id: ProviderId): RateLimiter {
    const limit = this.deps.config().requestsPerMinute[id] ?? 0;
    let l = this.limiters.get(id);
    if (!l) { l = new RateLimiter(limit, this.now); this.limiters.set(id, l); }
    l.setLimit(limit);
    return l;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => { clearTimeout(t); this.wakers.delete(done); resolve(); };
      const t = setTimeout(done, ms);
      this.wakers.add(done);
    });
  }

  private wakeAll() { for (const w of [...this.wakers]) w(); }

  private taskOf(j: Job): CreatedTask {
    return { taskId: j.taskId!, statusUrl: j.statusUrl, responseUrl: j.responseUrl };
  }

  pump() {
    if (!this.running) return;
    const { parallel } = this.deps.config();
    if (!this.paused) {
      while (this.active.size < Math.max(1, parallel)) {
        // Primero retomamos tareas ya creadas (tras reinicio o detener), luego las nuevas.
        const next =
          this.jobs.find((j) => j.state === 'rendering' && j.taskId && !this.active.has(j.id)) ??
          this.jobs.find((j) => j.state === 'waiting' && !this.active.has(j.id));
        if (!next) break;
        this.launch(next);
      }
    }
    if (this.active.size === 0 && !this.jobs.some((j) => j.state === 'waiting' || (j.state === 'rendering' && j.taskId))) {
      if (!this.paused) {
        this.running = false;
        const c = this.counts();
        this.deps.log('success', `Lote terminado: ${c.saved} guardados, ${c.failed} con error`);
        this.touch();
      }
    }
  }

  private launch(job: Job) {
    this.active.add(job.id);
    const token = this.runToken;
    this.process(job, token)
      .catch((e) => {
        this.update(job, { state: 'error', error: String(e?.message ?? e), finishedAt: this.now() });
        this.deps.log('error', `#${job.index} error inesperado: ${e?.message ?? e}`);
      })
      .finally(() => {
        this.active.delete(job.id);
        this.deps.changed();
        this.pump();
      });
  }

  private alive(job: Job, token: number) {
    return this.running && token === this.runToken && job.state !== 'cancelled' && this.jobs.includes(job);
  }

  private noteServiceIssue(provider: ProviderId, message: string) {
    const now = this.now();
    if (this.serviceIssue && this.serviceIssue.provider === provider) {
      this.serviceIssue = { ...this.serviceIssue, message, count: this.serviceIssue.count + 1 };
    } else {
      this.serviceIssue = { provider, message, since: now, count: 1 };
    }
  }

  private clearServiceIssue(provider: ProviderId) {
    if (this.serviceIssue?.provider === provider) this.serviceIssue = null;
  }

  private delayFor(err: unknown, attempt: number) {
    const base = this.deps.config().backoffBaseMs ?? 2000;
    if (err instanceof ProviderError && err.retryAfterMs !== undefined) return err.retryAfterMs;
    return backoffDelay(attempt, base, Math.max(base, 60000));
  }

  private async process(job: Job, token: number): Promise<void> {
    const cfg = () => this.deps.config();
    const provider = this.deps.getProvider(job.params.provider);
    const tag = `#${job.index}${job.variant > 1 ? `.v${job.variant}` : ''}`;

    // 1) Enviar la tarea
    while (!job.taskId) {
      this.update(job, { state: 'sending', startedAt: job.startedAt ?? this.now() });
      await this.limiter(job.params.provider).acquire();
      if (!this.alive(job, token)) return this.release(job);
      try {
        const task = await provider.createTask(job.prompt, job.params);
        if (!this.alive(job, token)) {
          // Si se detuvo justo ahora conservamos el id para retomarla después.
          if (job.state !== 'cancelled') this.update(job, { ...task, state: 'rendering' });
          return;
        }
        this.update(job, { taskId: task.taskId, statusUrl: task.statusUrl, responseUrl: task.responseUrl, state: 'rendering', progress: undefined });
        this.deps.log('info', `${tag} enviado a ${provider.label} → tarea ${task.taskId}`);
      } catch (e: any) {
        const retryable = e instanceof ProviderError ? e.retryable : true;
        if (e instanceof ProviderError && e.serviceSide) this.noteServiceIssue(job.params.provider, e.message);
        job.attempts++;
        if (retryable && job.attempts <= cfg().maxRetries) {
          const d = this.delayFor(e, job.attempts);
          this.update(job, { error: e.message });
          this.deps.log('warn', `${tag} ${e.message} — reintento ${job.attempts}/${cfg().maxRetries} en ${Math.round(d / 1000)} s`);
          await this.sleep(d);
          if (!this.alive(job, token)) return this.release(job);
          continue;
        }
        this.update(job, { state: retryable ? 'review' : 'error', error: e.message, finishedAt: this.now() });
        this.deps.log('error', `${tag} no se pudo enviar: ${e.message}`);
        return;
      }
    }

    // 2) Consultar estado hasta terminar
    let pollErrors = 0;
    for (;;) {
      await this.sleep(Math.max(0.01, cfg().pollIntervalSec) * 1000);
      if (!this.alive(job, token)) return;
      let st;
      try {
        st = await provider.getStatus(this.taskOf(job));
        pollErrors = 0;
      } catch (e: any) {
        const retryable = e instanceof ProviderError ? e.retryable : true;
        if (e instanceof ProviderError && e.serviceSide) this.noteServiceIssue(job.params.provider, e.message);
        pollErrors++;
        if (retryable && pollErrors < MAX_POLL_ERRORS) {
          this.deps.log('warn', `${tag} error al consultar estado (${e.message}); se sigue intentando`);
          this.deps.changed();
          await this.sleep(this.delayFor(e, pollErrors));
          continue;
        }
        this.update(job, { state: 'review', error: e.message, finishedAt: this.now() });
        this.deps.log('error', `${tag} se perdió el seguimiento de la tarea: ${e.message}`);
        return;
      }
      if (!this.alive(job, token)) return;

      if (st.state === 'queued' || st.state === 'running') {
        const progress = st.state === 'running' ? st.progress : undefined;
        if (job.progress !== progress || job.error) this.update(job, { progress, error: undefined });
        else this.deps.changed();
        continue;
      }
      if (st.state === 'cancelled') {
        this.update(job, { state: 'cancelled', finishedAt: this.now() });
        return;
      }
      if (st.state === 'failed') {
        if (st.serviceSide) this.noteServiceIssue(job.params.provider, st.error);
        job.attempts++;
        if (st.serviceSide && job.attempts <= cfg().maxRetries) {
          this.deps.log('warn', `${tag} falló en el servidor (${st.error}); se reenvía (${job.attempts}/${cfg().maxRetries})`);
          this.update(job, { taskId: undefined, statusUrl: undefined, responseUrl: undefined, state: 'waiting', error: st.error });
          return; // vuelve a la cola
        }
        this.update(job, { state: 'review', error: st.error, finishedAt: this.now() });
        this.deps.log('error', `${tag} falló: ${st.error}`);
        return;
      }

      // 3) Descargar
      this.clearServiceIssue(job.params.provider);
      this.update(job, { state: 'downloading', progress: 100 });
      const videoUrl = st.state === 'succeeded' ? st.videoUrl : null;
      for (let a = 1; ; a++) {
        try {
          const path = await this.deps.download(videoUrl, job);
          const ts = this.now();
          const day = dayKey(ts);
          this.stats = { allTime: this.stats.allTime + 1, byDay: { ...this.stats.byDay, [day]: (this.stats.byDay[day] ?? 0) + 1 } };
          this.update(job, { state: 'saved', outputPath: path, finishedAt: ts, error: undefined });
          this.deps.log('success', `${tag} guardado → ${path}`);
          return;
        } catch (e: any) {
          if (a >= 3) {
            this.update(job, { state: 'review', error: `Descarga fallida: ${e?.message ?? e}`, finishedAt: this.now() });
            this.deps.log('error', `${tag} no se pudo descargar: ${e?.message ?? e}`);
            return;
          }
          this.deps.log('warn', `${tag} reintentando descarga (${a}/3)`);
          await this.sleep(this.delayFor(e, a));
        }
      }
    }
  }

  /** Al detener antes de crear la tarea, el trabajo vuelve a "en espera". */
  private release(job: Job) {
    if (job.state === 'sending' && !job.taskId) this.update(job, { state: 'waiting' });
  }
}
