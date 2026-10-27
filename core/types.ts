export type ProviderId = 'fal' | 'byteplus' | 'pollinations' | 'mock';

export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:3' | '3:4' | '21:9';
export type Resolution = '480p' | '720p' | '1080p';

export type JobState =
  | 'waiting'      // En espera
  | 'sending'      // Enviando la tarea a la API
  | 'rendering'    // La API está generando el video
  | 'downloading'  // Descargando el MP4
  | 'saved'        // Guardado en disco
  | 'error'        // Falló (se puede reintentar)
  | 'review'       // Necesita revisión (agotó reintentos)
  | 'cancelled';

export interface GenerationParams {
  provider: ProviderId;
  model: string;
  durationSec: number;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  negativePrompt?: string;
  generateAudio?: boolean;
}

export interface Job {
  id: string;
  index: number;          // posición en el lote (1-based)
  variant: number;        // variante del mismo prompt (1-based)
  prompt: string;
  params: GenerationParams;
  state: JobState;
  taskId?: string;        // id de la tarea en el proveedor
  statusUrl?: string;     // (fal) url de estado
  responseUrl?: string;   // (fal) url de resultado
  progress?: number;      // 0-100 si el proveedor lo informa
  attempts: number;
  error?: string;
  outputPath?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface PromptItem {
  prompt: string;
  negativePrompt?: string;
  durationSec?: number;
  aspectRatio?: AspectRatio;
}

export interface Stats {
  allTime: number;
  byDay: Record<string, number>; // YYYY-MM-DD -> videos guardados
}

export interface Settings {
  language: 'es' | 'en';
  outputDir: string;
  provider: ProviderId;
  models: Record<ProviderId, string[]>;
  selectedModel: Record<ProviderId, string>;
  durationSec: number;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  variantsPerPrompt: number;
  parallel: number;
  maxRetries: number;
  pollIntervalSec: number;
  negativePrompt: string;
  onePromptPerLine: boolean;
  proxyUrl: string;
  pricePerSecond: Record<ProviderId, number>;
  requestsPerMinute: Record<ProviderId, number>;
  geminiModel: string;
  generateAudio: boolean;
  /** Control remoto desde el celular en la misma red Wi-Fi. */
  remoteEnabled: boolean;
  remotePort: number;
  remoteToken: string;
}

export type LogLevel = 'info' | 'warn' | 'error' | 'success';
export interface LogEntry { ts: number; level: LogLevel; message: string }

export interface ServiceIssue {
  provider: ProviderId;
  message: string;
  since: number;
  count: number;
}

export interface EngineState {
  jobs: Job[];
  running: boolean;
  paused: boolean;
  stats: Stats;
  serviceIssue: ServiceIssue | null;
  connection: { proxy: boolean };
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'es',
  outputDir: '',
  provider: 'pollinations',
  models: {
    fal: [
      'bytedance/seedance-2.5/text-to-video',
      'bytedance/seedance-2.0/fast/text-to-video',
      'fal-ai/bytedance/seedance/v1.5/pro/text-to-video',
    ],
    byteplus: ['dreamina-seedance-2-5-260628', 'seedance-1-0-pro-250528'],
    pollinations: ['pollinations-video-free'],
    mock: ['demo-simulado'],
  },
  selectedModel: {
    fal: 'bytedance/seedance-2.5/text-to-video',
    byteplus: 'dreamina-seedance-2-5-260628',
    pollinations: 'pollinations-video-free',
    mock: 'demo-simulado',
  },
  durationSec: 10,
  aspectRatio: '9:16',
  resolution: '720p',
  variantsPerPrompt: 1,
  parallel: 1,
  maxRetries: 3,
  pollIntervalSec: 8,
  negativePrompt: '',
  onePromptPerLine: false,
  proxyUrl: '',
  pricePerSecond: { fal: 0, byteplus: 0, pollinations: 0, mock: 0 },
  requestsPerMinute: { fal: 10, byteplus: 10, pollinations: 30, mock: 60 },
  geminiModel: 'gemini-2.5-flash',
  generateAudio: true,
  remoteEnabled: false,
  remotePort: 8787,
  remoteToken: ''
};
