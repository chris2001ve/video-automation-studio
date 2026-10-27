import type { VideoProvider } from './types';
import type { FetchFn } from './http';
import type { GenerationParams, ProviderJobState } from '../types';

export class PollinationsProvider implements VideoProvider {
  constructor(private fetchFn: FetchFn) {}

  async testConnection(): Promise<string> {
    return 'Servidor de video gratuito conectado correctamente';
  }

  async submitJob(prompt: string, params: GenerationParams): Promise<{ taskId: string }> {
    const cleanPrompt = encodeURIComponent(prompt.trim());
    // Endpoint abierto para generación de video
    const videoUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?model=video&width=720&height=1280&seed=${Date.now()}`;
    return { taskId: videoUrl };
  }

  async checkStatus(taskId: string): Promise<ProviderJobState> {
    // Al ser endpoint directo, retorna completado para proceder a la descarga
    return {
      state: 'completed',
      videoUrl: taskId,
    };
  }
}
