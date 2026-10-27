export function slugify(text: string, max = 40): string {
  const s = text
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (s.slice(0, max).replace(/-+$/, '')) || 'video';
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** {fecha}_{índice}_{slug}.mp4 — ej. 2026-10-27_003-v1_dragon-sobre-tunja.mp4 */
export function outputFileName(ts: number, index: number, variant: number, prompt: string, ext = 'mp4'): string {
  return `${dayKey(ts)}_${String(index).padStart(3, '0')}-v${variant}_${slugify(prompt)}.${ext}`;
}

export function estimateCost(prompts: number, variants: number, durationSec: number, pricePerSecond: number): number {
  return Math.round(prompts * variants * durationSec * pricePerSecond * 100) / 100;
}

/**
 * Valor "recomendado" de videos en paralelo. Solo los envíos de tareas cuentan para el límite
 * por minuto; un video tarda ~1-3 min en generarse, así que ~1/3 del límite mantiene la cola llena
 * sin provocar errores 429.
 */
export function recommendedParallel(requestsPerMinute: number): number {
  if (requestsPerMinute <= 0) return 4;
  return Math.min(8, Math.max(1, Math.round(requestsPerMinute / 3)));
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
