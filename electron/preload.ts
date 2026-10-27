import { contextBridge, ipcRenderer } from 'electron';

const invoke = (ch: string, ...args: unknown[]) => ipcRenderer.invoke(ch, ...args);
const on = (ch: string) => (cb: (data: any) => void) => {
  const h = (_e: unknown, d: any) => cb(d);
  ipcRenderer.on(ch, h);
  return () => { ipcRenderer.removeListener(ch, h); };
};

const api = {
  init: () => invoke('init'),
  saveSettings: (patch: unknown) => invoke('settings:save', patch),
  setKey: (name: string, value: string) => invoke('keys:set', name, value),
  testProvider: (id: string) => invoke('provider:test', id),
  chooseFolder: () => invoke('dialog:folder'),
  importFile: (onePerLine: boolean) => invoke('dialog:import', onePerLine),
  openPath: (p: string) => invoke('shell:open', p),
  reveal: (p: string) => invoke('shell:reveal', p),
  openOutputFolder: () => invoke('shell:openFolder'),
  enqueue: (items: unknown, params: unknown, variants: number) => invoke('queue:enqueue', items, params, variants),
  start: () => invoke('queue:start'),
  pause: () => invoke('queue:pause'),
  resume: () => invoke('queue:resume'),
  stop: () => invoke('queue:stop'),
  retry: (id: string) => invoke('job:retry', id),
  retryFailed: () => invoke('job:retryFailed'),
  cancel: (id: string) => invoke('job:cancel', id),
  duplicate: (id: string) => invoke('job:duplicate', id),
  remove: (id: string) => invoke('job:remove', id),
  clearFinished: () => invoke('queue:clearFinished'),
  clearAll: () => invoke('queue:clearAll'),
  enhance: (prompts: string[]) => invoke('gemini:enhance', prompts),
  exportLogs: (text: string) => invoke('logs:export', text),
  clearLogs: () => invoke('logs:clear'),
  importText: (fileName: string, content: string, onePerLine: boolean) => invoke('import:text', fileName, content, onePerLine),
  remoteInfo: () => invoke('remote:info'),
  remoteSet: (patch: unknown) => invoke('remote:set', patch),
  remoteRegen: () => invoke('remote:regen'),
  onState: on('state'),
  onLog: on('log'),
  onSettings: on('settings'),
  onKeys: on('keys'),
  onRemote: on('remote'),
};

contextBridge.exposeInMainWorld('studio', api);
export type StudioApi = typeof api;
