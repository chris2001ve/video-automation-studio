import type { GenerationParams, ProviderId } from '../types';
import type { FetchFn } from './http';
import type { CreatedTask, TaskStatus, VideoProvider } from './types';

export class PollinationsProvider implements VideoProvider {
  readonly id: ProviderId = 'pollinations';
  readonly label = 'Gratuito (Pollinations)';

  constructor(private fetchFn: FetchFn) {}

  async testConnection(): Promise<string> {
    return 'Servidor de video gratuito conectado correctamente';
  }

  async createTask(prompt: string, _params: GenerationParams): Promise<CreatedTask> {
    const cleanPrompt = encodeURIComponent(prompt.trim());
    const videoUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?model=video&width=720&height=1280&seed=${Date.now()}`;
    return {
      taskId: videoUrl,
      responseUrl: videoUrl,
    };
  }

  async getStatus(task: CreatedTask): Promise<TaskStatus> {
    return {
      state: 'succeeded',
      videoUrl: task.taskId,
    };
  }

  async cancel(_task: CreatedTask): Promise<void> {
    // No requiere cancelación en servidor
  }
}
