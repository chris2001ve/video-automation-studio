import type { EngineState, GenerationParams, LogEntry, PromptItem, ProviderId, Settings } from '../core/types';

export type KeyName = 'fal' | 'byteplus' | 'gemini' | 'pollinations';

export interface InitData {
  settings: Settings;
  state: EngineState;
  logs: LogEntry[];
  keys: Record<KeyName, boolean>;
  secureStorage: boolean;
  version: string;
  providers: Record<ProviderId, string>;
  /** desktop = app de escritorio · remote = celular controlando el PC · demo = navegador sin PC */
  mode?: 'desktop' | 'remote' | 'demo';
  host?: string;
}

export interface RemoteInfo {
  enabled: boolean;
  running: boolean;
  port: number;
  urls: string[];
  token: string;
  clients: number;
  error: string | null;
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
  onSettings?(cb: (s: Settings) => void): () => void;
  onKeys?(cb: (k: Record<KeyName, boolean>) => void): () => void;
  /** Solo en escritorio: control desde el celular. */
  remoteInfo?(): Promise<RemoteInfo>;
  remoteSet?(patch: { enabled?: boolean; port?: number }): Promise<RemoteInfo>;
  remoteRegen?(): Promise<RemoteInfo>;
  onRemote?(cb: (r: RemoteInfo) => void): () => void;
  /** Solo en el celular: estado de la conexión con el PC. */
  onConnection?(cb: (online: boolean) => void): () => void;
}

declare global {
  interface Window { studio?: StudioApi }
}

export async function getApi(): Promise<StudioApi> {
  if (window.studio) return window.studio;
  // Servido por la app de escritorio en la red Wi-Fi: el celular controla el PC.
  const { detectRemote, createRemoteApi } = await import('./remoteApi');
  const host = await detectRemote();
  if (host) return createRemoteApi(host);
  // Fuera de Electron (navegador): modo vista previa con el proveedor simulado.
  const { createBrowserApi } = await import('./browserApi');
  return createBrowserApi();
}
