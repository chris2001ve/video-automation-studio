import type { FetchFn, Provider } from './types';
import type { GenerationParams } from '../types';

export class PollinationsProvider implements Provider {
  constructor(private fetchFn: FetchFn) {}

  async testConnection(): Promise<string> {
    return 'Conectado al generador gratuito de video';
  }

  async submitJob(prompt: string, params: GenerationParams): Promise<{ taskId: string }> {
    // Pollinations genera videos directamente vía URL o endpoint de inferencia abierta
    const encodedPrompt = encodeURIComponent(prompt);
    const videoUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=video&width=720&height=1280&seed=${Date.now()}`;
    return { taskId: videoUrl };
  }

  async checkStatus(taskId: string): Promise<{ state: 'completed'; videoUrl: string }> {
    // La URL es directa; el motor pasa a descargar el mp4
    return {
      state: 'completed',
      videoUrl: taskId,
    };
  }
}
