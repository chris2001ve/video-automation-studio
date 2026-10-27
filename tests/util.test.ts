import { describe, expect, it } from 'vitest';
import { RateLimiter, backoffDelay, isRetryableStatus, parseRetryAfter } from '../core/backoff';
import { estimateCost, outputFileName, recommendedParallel, slugify } from '../core/util';

describe('backoff', () => {
  it('crece exponencialmente con tope', () => {
    const r = () => 0.5; // sin jitter
    expect(backoffDelay(1, 1000, 10000, r)).toBe(1000);
    expect(backoffDelay(3, 1000, 10000, r)).toBe(4000);
    expect(backoffDelay(10, 1000, 10000, r)).toBe(10000);
  });
  it('jitter dentro de ±20 %', () => {
    for (let i = 0; i < 50; i++) {
      const d = backoffDelay(2, 1000);
      expect(d).toBeGreaterThanOrEqual(1600);
      expect(d).toBeLessThanOrEqual(2400);
    }
  });
  it('estados reintentables', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
  });
  it('Retry-After', () => {
    expect(parseRetryAfter('5')).toBe(5000);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter(new Date(10000).toUTCString(), 4000)).toBe(6000);
  });
  it('RateLimiter espera cuando se supera el límite', async () => {
    let t = 0; const waits: number[] = [];
    const rl = new RateLimiter(2, () => t, async (ms) => { waits.push(ms); t += ms; });
    await rl.acquire(); await rl.acquire(); await rl.acquire();
    expect(waits.length).toBe(1);
    expect(t).toBeGreaterThanOrEqual(60000);
  });
});

describe('util', () => {
  it('slugify', () => {
    expect(slugify('¡Un Dragón sobre Tunja, Boyacá!')).toBe('un-dragon-sobre-tunja-boyaca');
    expect(slugify('***')).toBe('video');
  });
  it('nombre de archivo', () => {
    const ts = new Date(2026, 9, 27, 10).getTime();
    expect(outputFileName(ts, 3, 1, 'Un gato')).toBe('2026-10-27_003-v1_un-gato.mp4');
  });
  it('costo y paralelismo recomendado', () => {
    expect(estimateCost(14, 1, 10, 0.05)).toBe(7);
    expect(recommendedParallel(10)).toBe(3);
    expect(recommendedParallel(100)).toBe(8);
    expect(recommendedParallel(1)).toBe(1);
  });
});
