import { describe, expect, it } from 'vitest';
import { ProviderError } from '../core/backoff';
import { BytePlusProvider } from '../core/providers/byteplus';
import { FalProvider } from '../core/providers/fal';
import type { GenerationParams } from '../core/types';

const p: GenerationParams = { provider: 'fal', model: 'bytedance/seedance-2.5/text-to-video', durationSec: 10, aspectRatio: '9:16', resolution: '720p', negativePrompt: 'blur' };

function fakeFetch(routes: Record<string, () => Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response('not found', { status: 404 });
    return routes[key]();
  };
  return { fn, calls };
}
const json = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers });

describe('FalProvider', () => {
  it('envía, consulta y obtiene el video', async () => {
    const f = fakeFetch({
      '/status': () => json({ status: 'COMPLETED' }),
      'requests/abc': () => json({ video: { url: 'https://v.mp4' } }),
      'text-to-video': () => json({ request_id: 'abc', status_url: 'https://queue.fal.run/x/requests/abc/status', response_url: 'https://queue.fal.run/x/requests/abc' }),
    });
    const fal = new FalProvider('KEY', f.fn);
    const task = await fal.createTask('Un gato', p);
    expect(task.taskId).toBe('abc');
    const body = JSON.parse(String(f.calls[0].init!.body));
    expect(body).toMatchObject({ prompt: 'Un gato\n\nAvoid: blur', duration: '10', aspect_ratio: '9:16', resolution: '720p' });
    expect((f.calls[0].init!.headers as any).Authorization).toBe('Key KEY');
    expect(await fal.getStatus(task)).toEqual({ state: 'succeeded', videoUrl: 'https://v.mp4' });
  });
  it('429 es reintentable con Retry-After', async () => {
    const f = fakeFetch({ 'text-to-video': () => json({ detail: 'rate limited' }, 429, { 'retry-after': '7' }) });
    const err = await new FalProvider('K', f.fn).createTask('x', p).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.retryable).toBe(true);
    expect(err.retryAfterMs).toBe(7000);
  });
  it('sin API key no reintenta', async () => {
    const err = await new FalProvider('', fakeFetch({}).fn).createTask('x', p).catch((e) => e);
    expect(err.retryable).toBe(false);
  });
});

describe('BytePlusProvider', () => {
  it('crea la tarea con el formato oficial y lee el resultado', async () => {
    const f = fakeFetch({
      'tasks/cgt-1': () => json({ id: 'cgt-1', status: 'succeeded', content: { video_url: 'https://b.mp4' } }),
      'generations/tasks': () => json({ id: 'cgt-1' }),
    });
    const bp = new BytePlusProvider('K', f.fn);
    const task = await bp.createTask('Hola', { ...p, provider: 'byteplus', model: 'seedance-1-0-pro-250528', negativePrompt: undefined });
    const body = JSON.parse(String(f.calls[0].init!.body));
    expect(body).toMatchObject({ model: 'seedance-1-0-pro-250528', content: [{ type: 'text', text: 'Hola' }], ratio: '9:16', duration: 10, watermark: false });
    expect(await bp.getStatus(task)).toEqual({ state: 'succeeded', videoUrl: 'https://b.mp4' });
  });
  it('detecta fallos del servidor', async () => {
    const f = fakeFetch({ 'tasks/x': () => json({ status: 'failed', error: { message: 'Internal system error' } }) });
    const st = await new BytePlusProvider('K', f.fn).getStatus({ taskId: 'x' });
    expect(st).toEqual({ state: 'failed', error: 'Internal system error', serviceSide: true });
  });
  it('5xx marca serviceSide', async () => {
    const f = fakeFetch({ 'tasks/x': () => json({ error: { message: 'system error' } }, 503) });
    const err = await new BytePlusProvider('K', f.fn).getStatus({ taskId: 'x' }).catch((e) => e);
    expect(err.serviceSide).toBe(true);
    expect(err.message).toContain('system error');
  });
});
