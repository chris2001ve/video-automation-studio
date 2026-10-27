import { ProviderError } from '../backoff';
import { buildPromptText } from '../promptParser';
import type { GenerationParams } from '../types';
import { requestJson, type FetchFn } from './http';
import type { CreatedTask, TaskStatus, VideoProvider } from './types';

const QUEUE = 'https://queue.fal.run';

/**
 * fal.ai — API de cola oficial (https://fal.ai/models/bytedance/seedance-2.5/text-to-video/api).
 * POST https://queue.fal.run/{model} → { request_id, status_url, response_url }
 * GET status_url → { status: IN_QUEUE | IN_PROGRESS | COMPLETED }
 * GET response_url → { video: { url } }
 */
export class FalProvider implements VideoProvider {
  id = 'fal' as const;
  label = 'fal.ai';
  constructor(private apiKey: string, private fetchFn: FetchFn) {}

  private headers() {
    if (!this.apiKey) throw new ProviderError('Falta la API key de fal.ai (Ajustes)', 401, false);
    return { Authorization: `Key ${this.apiKey}`, 'Content-Type': 'application/json' };
  }

  async createTask(prompt: string, p: GenerationParams): Promise<CreatedTask> {
    const input: Record<string, unknown> = {
      prompt: buildPromptText(prompt, p.negativePrompt),
      duration: String(p.durationSec),
      aspect_ratio: p.aspectRatio,
      resolution: p.resolution,
    };
    if (p.generateAudio !== undefined) input.generate_audio = p.generateAudio;
    const body = await requestJson(this.fetchFn, `${QUEUE}/${p.model}`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify(input),
    });
    if (!body?.request_id) throw new ProviderError('Respuesta inesperada de fal.ai (sin request_id)', 502, true);
    const base = `${QUEUE}/${p.model}/requests/${body.request_id}`;
    return {
      taskId: body.request_id,
      statusUrl: body.status_url ?? `${base}/status`,
      responseUrl: body.response_url ?? base,
    };
  }

  async getStatus(task: CreatedTask): Promise<TaskStatus> {
    const st = await requestJson(this.fetchFn, task.statusUrl!, { headers: this.headers() });
    const status: string = st?.status ?? '';
    if (status === 'IN_QUEUE') return { state: 'queued' };
    if (status === 'IN_PROGRESS') return { state: 'running' };
    if (status === 'COMPLETED') {
      if (st?.error) return { state: 'failed', error: String(st.error) };
      try {
        const res = await requestJson(this.fetchFn, task.responseUrl!, { headers: this.headers() });
        const url = res?.video?.url ?? res?.videos?.[0]?.url ?? null;
        if (!url) return { state: 'failed', error: 'fal.ai no devolvió la URL del video' };
        return { state: 'succeeded', videoUrl: url };
      } catch (e) {
        if (e instanceof ProviderError && !e.retryable) return { state: 'failed', error: e.message };
        throw e;
      }
    }
    return { state: 'queued' };
  }

  async cancel(task: CreatedTask): Promise<void> {
    if (!task.responseUrl) return;
    await requestJson(this.fetchFn, `${task.responseUrl}/cancel`, { method: 'PUT', headers: this.headers() }).catch(() => {});
  }

  async testConnection(): Promise<string> {
    this.headers();
    // Una consulta de estado con un id inexistente valida la clave sin crear tareas (401 = clave inválida).
    try {
      await requestJson(this.fetchFn, `${QUEUE}/bytedance/seedance-2.5/text-to-video/requests/00000000-0000-0000-0000-000000000000/status`, { headers: this.headers() });
    } catch (e) {
      if (e instanceof ProviderError && (e.status === 401 || e.status === 403)) throw new ProviderError('API key de fal.ai inválida', e.status);
      if (e instanceof ProviderError && e.status === undefined) throw e;
    }
    return 'Conexión con fal.ai correcta';
  }
}
