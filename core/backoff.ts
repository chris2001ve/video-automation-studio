export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable = false,
    public readonly retryAfterMs?: number,
    public readonly serviceSide = false,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

/** Backoff exponencial con jitter: base * 2^(attempt-1), con un tope, ±20 %. */
export function backoffDelay(attempt: number, baseMs = 2000, maxMs = 60000, rand = Math.random): number {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attempt - 1)));
  const jitter = exp * 0.2 * (rand() * 2 - 1);
  return Math.max(0, Math.round(exp + jitter));
}

export function parseRetryAfter(header: string | null | undefined, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - now);
  return undefined;
}

/** Limita las solicitudes por minuto (ventana deslizante). */
export class RateLimiter {
  private stamps: number[] = [];
  constructor(
    private perMinute: number,
    private now: () => number = Date.now,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}
  setLimit(perMinute: number) { this.perMinute = perMinute; }
  async acquire(): Promise<void> {
    if (this.perMinute <= 0) return;
    for (;;) {
      const t = this.now();
      this.stamps = this.stamps.filter((s) => t - s < 60000);
      if (this.stamps.length < this.perMinute) { this.stamps.push(t); return; }
      await this.sleep(60000 - (t - this.stamps[0]) + 5);
    }
  }
}
