import type { GenerationParams } from '../types';
import type { CreatedTask, TaskStatus, VideoProvider } from './types';

/** Proveedor simulado: sirve para probar la interfaz y la cola sin gastar créditos. */
export class MockProvider implements VideoProvider {
  id = 'mock' as const;
  label = 'Demo (simulado)';
  private tasks = new Map<string, { start: number; total: number; fail: boolean }>();
  constructor(private now: () => number = Date.now, private renderMs = 12000, private failRate = 0.1) {}

  async createTask(prompt: string, _p: GenerationParams): Promise<CreatedTask> {
    const id = 'mock-' + Math.random().toString(36).slice(2, 10);
    const fail = /\bfail\b/i.test(prompt) || Math.random() < this.failRate;
    this.tasks.set(id, { start: this.now(), total: this.renderMs * (0.6 + Math.random() * 0.8), fail });
    return { taskId: id };
  }

  async getStatus(task: CreatedTask): Promise<TaskStatus> {
    const t = this.tasks.get(task.taskId);
    if (!t) return { state: 'failed', error: 'Tarea simulada no encontrada (se reinició la app)' };
    const p = (this.now() - t.start) / t.total;
    if (p < 0.15) return { state: 'queued' };
    if (p < 1) return { state: 'running', progress: Math.round(p * 100) };
    if (t.fail) return { state: 'failed', error: 'Error simulado del servicio', serviceSide: true };
    return { state: 'succeeded', videoUrl: null };
  }

  async testConnection(): Promise<string> { return 'Modo demo activo (no se usa ninguna API)'; }
}
