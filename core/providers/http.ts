import { ProviderError, isRetryableStatus, parseRetryAfter } from '../backoff';

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export async function requestJson<T = any>(fetchFn: FetchFn, url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(url, init);
  } catch (e: any) {
    throw new ProviderError(`Error de red: ${e?.message ?? e}`, undefined, true, undefined, false);
  }
  const text = await res.text();
  let body: any = undefined;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  if (!res.ok) {
    const msg =
      body?.error?.message ?? body?.detail?.[0]?.msg ?? body?.detail ?? body?.message ??
      (typeof body === 'string' ? body.slice(0, 200) : '') ?? '';
    throw new ProviderError(
      `HTTP ${res.status}${msg ? `: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}` : ''}`,
      res.status,
      isRetryableStatus(res.status),
      parseRetryAfter(res.headers.get('retry-after')),
      res.status >= 500,
    );
  }
  return body as T;
}
