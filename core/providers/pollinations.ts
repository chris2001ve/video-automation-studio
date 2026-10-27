import type { GenerationParams } from '../types';
import type { FetchFn } from './http';
import type { CreatedTask, TaskStatus, VideoProvider } from './types';

// sk_RjejKTrZBBczDVGDEArA6RBYxGEFWLZS:
const POLLINATIONS_API_KEY = 'sk_PEGA_AQUI_TU_LLAVE';

export class PollinationsProvider implements VideoProvider {
  readonly id = 'pollinations';

  constructor(private readonly fetchFn: FetchFn) {}

  async testConnection(): Promise<string> {
    try {
      const res = await this.fetchFn('https://gen.pollinations.ai/v1/models', {
        headers: {
          'Authorization': `Bearer ${POLLINATIONS_API_KEY}`,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return 'Conexión exitosa con Pollinations.ai';
    } catch (e: any) {
      throw new Error(`Fallo de conexión: ${e?.message ?? e}`);
    }
  }

  async createTask(prompt: string, params: GenerationParams): Promise<CreatedTask> {
    const cleanPrompt = encodeURIComponent(prompt.trim());
    
    let width = 720;
    let height = 1280;
    if (params.aspectRatio === '16:9') {
      width = 1280;
      height = 720;
    } else if (params.aspectRatio === '1:1') {
      width = 1024;
      height = 1024;
    }

    // Endpoint oficial autenticado por gateway con token Bearer
    const videoUrl = `https://gen.pollinations.ai/video/${cleanPrompt}?width=${width}&height=${height}&model=seedance&key=${POLLINATIONS_API_KEY}`;

    return {
      taskId: `polli_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      videoUrl,
    };
  }

  async pollStatus(task: CreatedTask): Promise<TaskStatus> {
    if (task.videoUrl) {
      return {
        state: 'completed',
        videoUrl: task.videoUrl,
      };
    }
    return {
      state: 'failed',
      error: 'No se generó URL de video',
    };
  }

  async cancel(_task: CreatedTask): Promise<void> {
    // No requiere cancelación remota
  }
}
