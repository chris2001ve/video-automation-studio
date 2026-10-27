import type { GenerationParams, ProviderId } from '../types';

export interface CreatedTask {
  taskId: string;
  statusUrl?: string;
  responseUrl?: string;
}

export type TaskStatus =
  | { state: 'queued' | 'running'; progress?: number }
  | { state: 'succeeded'; videoUrl: string | null }
  | { state: 'failed'; error: string; serviceSide?: boolean }
  | { state: 'cancelled' };

export interface VideoProvider {
  id: ProviderId;
  label: string;
  createTask(prompt: string, params: GenerationParams): Promise<CreatedTask>;
  getStatus(task: CreatedTask): Promise<TaskStatus>;
  cancel?(task: CreatedTask): Promise<void>;
  testConnection(): Promise<string>;
}
