import { ProviderError } from '../backoff';
import { buildPromptText } from '../promptParser';
import type { GenerationParams } from '../types';
import { requestJson, type FetchFn } from './http';
import type { CreatedTask, TaskStatus, VideoProvider } from './types';

const BASE = 'https://ark.ap-southeast.bytepluses.com/api/v3';

/**
 * BytePlus ModelArk — API oficial de Seedance (https://docs.byteplus.com/en/docs/modelark/1366799).
 * POST /contents/generations/tasks → { id }
 * GET  /contents/generations/tasks/{id} → { status: queued|running|succeeded|failed|cancelled, content.video_url }
 */
export class BytePlusProvider implements VideoProvider {
  id = 'byteplus' as const;
  label = 'BytePlus ModelArk';
  constructor(private apiKey: string, private fetchFn: FetchFn, private baseUrl = BASE) {}

  private headers() {
    if (!this.apiKey) throw new ProviderError('Falta la API key de BytePlus (Ajustes)', 401, false);
    return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' };
  }

  async createTask(prompt: string, p: GenerationParams): Promise<CreatedTask> {
    const payload: Record<string, unknown> = {
      model: p.model,
      content: [{ type: 'text', text: buildPromptText(prompt, p.negativePrompt) }],
      ratio: p.aspectRatio,
      duration: p.durationSec,
      resolution: p.resolution,
      watermark: false,
    };
    if (p.generateAudio !== undefined && /seedance-2/.test(p.model)) payload.generate_audio = p.generateAudio;
    const body = await requestJson(this.fetchFn, `${this.baseUrl}/contents/generations/tasks`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify(payload),
    });
    if (!body?.id) throw new ProviderError('Respuesta inesperada de BytePlus (sin id)', 502, true);
    return { taskId: body.id };
  }

  async getStatus(task: CreatedTask): Promise<TaskStatus> {
    const t = await requestJson(this.fetchFn, `${this.baseUrl}/contents/generations/tasks/${task.taskId}`, { headers: this.headers() });
    switch (t?.status) {
      case 'queued': return { state: 'queued' };
      case 'running': return { state: 'running' };
      case 'succeeded': return { state: 'succeeded', videoUrl: t?.content?.video_url ?? null };
      case 'cancelled': return { state: 'cancelled' };
      case 'failed': {
        const msg = t?.error?.message ?? t?.error?.code ?? 'La tarea falló';
        return { state: 'failed', error: String(msg), serviceSide: /internal|system|server/i.test(String(msg)) };
      }
      default: return { state: 'queued' };
    }
  }

  async cancel(task: CreatedTask): Promise<void> {
    await requestJson(this.fetchFn, `${this.baseUrl}/contents/generations/tasks/${task.taskId}`, { method: 'DELETE', headers: this.headers() }).catch(() => {});
  }

  async testConnection(): Promise<string> {
    await requestJson(this.fetchFn, `${this.baseUrl}/contents/generations/tasks?page_num=1&page_size=1`, { headers: this.headers() })
      .catch((e) => {
        if (e instanceof ProviderError && (e.status === 401 || e.status === 403)) throw new ProviderError('API key de BytePlus inválida', e.status);
        throw e;
      });
    return 'Conexión con BytePlus ModelArk correcta';
  }
}
