import type { EngineState, GenerationParams, LogEntry, PromptItem, ProviderId, Settings } from '../core/types';

export type KeyName = 'fal' | 'byteplus' | 'gemini';

export interface InitData {
  settings: Settings;
  state: EngineState;
  logs: LogEntry[];
  keys: Record<KeyName, boolean>;
  secureStorage: boolean;
  version: string;
  providers: Record<ProviderId, string>;
}

export interface StudioApi {
  init(): Promise<InitData>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;
  setKey(name: KeyName, value: string): Promise<Record<KeyName, boolean>>;
  testProvider(id: ProviderId): Promise<{ ok: boolean; message: string }>;
  chooseFolder(): Promise<string | null>;
  importFile(onePerLine: boolean): Promise<{ fileName: string; items: PromptItem[] } | null>;
  openPath(p: string): Promise<unknown>;
  reveal(p: string): Promise<unknown>;
  openOutputFolder(): Promise<unknown>;
  enqueue(items: PromptItem[], params: GenerationParams, variants: number): Promise<number>;
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  retry(id: string): Promise<void>;
  retryFailed(): Promise<void>;
  cancel(id: string): Promise<void>;
  duplicate(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  clearFinished(): Promise<void>;
  clearAll(): Promise<void>;
  enhance(prompts: string[]): Promise<{ ok: true; prompts: string[] } | { ok: false; message: string }>;
  exportLogs(text: string): Promise<boolean>;
  clearLogs(): Promise<void>;
  onState(cb: (s: EngineState) => void): () => void;
  onLog(cb: (l: LogEntry) => void): () => void;
}

declare global {
  interface Window { studio?: StudioApi }
}

export async function getApi(): Promise<StudioApi> {
  if (window.studio) return window.studio;
  // Fuera de Electron (navegador): modo vista previa con el proveedor simulado.
  const { createBrowserApi } = await import('./browserApi');
  return createBrowserApi();
}
