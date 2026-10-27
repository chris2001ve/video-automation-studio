import type { GenerationParams } from '../types';
import type { FetchFn } from './http';
import type { CreatedTask, TaskStatus, VideoProvider } from './types';

export class PollinationsProvider implements VideoProvider {
  readonly id = 'pollinations';

  constructor(private readonly fetchFn: FetchFn) {}

  async testConnection(): Promise<string> {
    try {
      const res = await this.fetchFn('https://image.pollinations.ai/prompt/test?width=32&height=32&nologo=true');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return 'Conexión exitosa con Pollinations.ai';
    } catch (e: any) {
      throw new Error(`Fallo de conexión: ${e?.message ?? e}`);
    }
  }

  async createTask(prompt: string, params: GenerationParams): Promise<CreatedTask> {
    const seed = Math.floor(Math.random() * 2147483647);
    const cleanPrompt = encodeURIComponent(prompt.trim());
    
    // Dimensiones según relación de aspecto
    let width = 720;
    let height = 1280;
    if (params.aspectRatio === '16:9') {
      width = 1280;
      height = 720;
    } else if (params.aspectRatio === '1:1') {
      width = 1024;
      height = 1024;
    }

    // URL directa de generación gratuita
    const videoUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true`;

    return {
      taskId: `polli_${Date.now()}_${seed}`,
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
      error: 'No se generó la URL de video en Pollinations',
    };
  }

  async cancel(_task: CreatedTask): Promise<void> {
    // No requiere cancelación en servidor
  }
}
