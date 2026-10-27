import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parsePrompts } from '../core/promptParser';
import type { EngineState, GenerationParams, LogEntry, PromptItem, Settings } from '../core/types';
import { getApi, type InitData, type KeyName, type StudioApi } from './api';
import { ActivityPanel } from './components/ActivityPanel';
import { GenerationSettings } from './components/GenerationSettings';
import { Header } from './components/Header';
import { LogConsole } from './components/LogConsole';
import { ModeBar, type Mode } from './components/ModeBar';
import { PromptPanel } from './components/PromptPanel';
import { QueueTable } from './components/QueueTable';
import { ServiceBanner } from './components/ServiceBanner';
import { SettingsModal } from './components/SettingsModal';
import { makeT } from './i18n';

export default function App() {
  const [api, setApi] = useState<StudioApi | null>(null);
  const [boot, setBoot] = useState<InitData | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [state, setState] = useState<EngineState | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [keys, setKeys] = useState<Record<KeyName, boolean>>({ fal: false, byteplus: false, gemini: false });
  const [mode, setMode] = useState<Mode>('multi');
  const [text, setText] = useState('');
  const [single, setSingle] = useState('');
  const [importedMeta, setImportedMeta] = useState<PromptItem[] | null>(null);
  const [videosToQueue, setVideosToQueue] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let off1 = () => {}, off2 = () => {};
    getApi().then(async (a) => {
      const d = await a.init();
      setApi(a); setBoot(d); setSettings(d.settings); setState(d.state); setLogs(d.logs); setKeys(d.keys);
      off1 = a.onState(setState);
      off2 = a.onLog((l) => setLogs((prev) => (prev.length > 1500 ? [...prev.slice(-1200), l] : [...prev, l])));
    });
    return () => { off1(); off2(); };
  }, []);

  const t = useMemo(() => makeT(settings?.language ?? 'es'), [settings?.language]);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const save = useCallback(async (patch: Partial<Settings>) => {
    if (!api) return;
    setSettings((s) => (s ? { ...s, ...patch } : s));
    const next = await api.saveSettings(patch);
    setSettings(next);
  }, [api]);

  const prompts: PromptItem[] = useMemo(() => {
    if (!settings) return [];
    if (mode === 'single') return single.trim() ? [{ prompt: single.trim() }] : [];
    const parsed = parsePrompts(text, settings.onePromptPerLine);
    // Si los prompts vienen de un CSV conservamos sus columnas extra mientras el texto no cambie.
    if (importedMeta && importedMeta.length === parsed.length && importedMeta.every((m, i) => m.prompt === parsed[i])) return importedMeta;
    return parsed.map((prompt) => ({ prompt }));
  }, [mode, single, text, settings, importedMeta]);

  if (!api || !settings || !state || !boot) {
    return <div className="flex h-full items-center justify-center text-slate-400">Cargando…</div>;
  }

  const provider = settings.provider;
  const needsKey = provider !== 'mock' && !keys[provider as KeyName];
  const params: GenerationParams = {
    provider,
    model: settings.selectedModel[provider],
    durationSec: settings.durationSec,
    aspectRatio: settings.aspectRatio,
    resolution: settings.resolution,
    negativePrompt: settings.negativePrompt.trim() || undefined,
    generateAudio: settings.generateAudio,
  };
  const selectedPrompts = videosToQueue > 0 ? prompts.slice(0, videosToQueue) : prompts;

  const addToQueue = async () => {
    if (needsKey) { notify(t('keyMissing', { p: boot.providers[provider] })); setShowSettings(true); return 0; }
    if (selectedPrompts.length === 0) return 0;
    const n = await api.enqueue(selectedPrompts, params, settings.variantsPerPrompt);
    notify(t('queuedChip', { n }));
    return n;
  };

  const start = async () => {
    const pending = state.jobs.some((j) => j.state === 'waiting' || (j.state === 'rendering' && j.taskId));
    if (!pending) {
      const n = await addToQueue();
      if (!n) return;
    }
    await api.start();
  };

  const importFile = async () => {
    const r = await api.importFile(settings.onePromptPerLine);
    if (!r) return;
    const body = r.items.map((i) => i.prompt).join(settings.onePromptPerLine ? '\n' : '\n\n---\n\n');
    setText(body);
    setImportedMeta(r.items.some((i) => i.durationSec || i.aspectRatio || i.negativePrompt) ? r.items : null);
    if (mode === 'single') setMode('multi');
    notify(`${r.fileName}: ${t('detected', { n: r.items.length })}`);
  };

  const enhance = async () => {
    const list = mode === 'single' ? (single.trim() ? [single.trim()] : []) : prompts.map((p) => p.prompt);
    if (!list.length) return;
    setEnhancing(true);
    const r = await api.enhance(list);
    setEnhancing(false);
    if (!r.ok) { notify(r.message); return; }
    if (mode === 'single') setSingle(r.prompts[0]);
    else { setText(r.prompts.join(settings.onePromptPerLine ? '\n' : '\n\n---\n\n')); setImportedMeta(null); }
  };

  const queuedCount = state.jobs.filter((j) => ['waiting', 'sending', 'rendering', 'downloading'].includes(j.state)).length;

  return (
    <div className="flex min-h-full flex-col gap-3 p-3 pb-6 lg:h-full lg:p-4 lg:pb-4">
      <Header t={t} version={boot.version} state={state} onSettings={() => setShowSettings(true)} />
      {!window.studio && (
        <div className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-cyan-100">
          {settings.language === 'en'
            ? 'Test mode in the browser: videos are simulated. Install the desktop app to generate real videos.'
            : 'Modo de prueba en el navegador: los videos son simulados. Instala la app de escritorio para generar videos reales.'}
        </div>
      )}
      {state.serviceIssue && <ServiceBanner t={t} issue={state.serviceIssue} label={boot.providers[state.serviceIssue.provider]} />}
      <ModeBar
        t={t} mode={mode} setMode={setMode} queued={queuedCount}
        onImport={importFile} onFolder={() => api.openOutputFolder()} onSettings={() => setShowSettings(true)}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(380px,1fr)]">
        <div className="contents lg:flex lg:min-h-0 lg:flex-col lg:gap-3">
          <PromptPanel
            t={t} mode={mode} text={text} setText={(v) => { setText(v); }} single={single} setSingle={setSingle}
            prompts={prompts} settings={settings} save={save} enhancing={enhancing} onEnhance={enhance}
            onAdd={addToQueue} onRemove={(i) => {
              const rest = prompts.filter((_, k) => k !== i);
              setText(rest.map((p) => p.prompt).join(settings.onePromptPerLine ? '\n' : '\n\n---\n\n'));
              setImportedMeta(importedMeta ? rest : null);
            }}
            canEnhance={keys.gemini}
          />
          <QueueTable t={t} state={state} api={api} providers={boot.providers} />
          <LogConsole t={t} logs={logs} api={api} onClear={() => setLogs([])} notify={notify} />
        </div>
        <div className="contents lg:flex lg:min-h-0 lg:flex-col lg:gap-3">
          <div className="order-2 lg:order-none lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:rounded-2xl">
          <GenerationSettings
            t={t} settings={settings} save={save} providers={boot.providers} keys={keys}
            promptCount={prompts.length} videosToQueue={videosToQueue} setVideosToQueue={setVideosToQueue}
          />
          </div>
          <ActivityPanel
            t={t} state={state} onStart={start} onPause={() => api.pause()} onResume={() => api.resume()} onStop={() => api.stop()}
            canStart={selectedPrompts.length > 0 || state.jobs.some((j) => j.state === 'waiting' || (j.state === 'rendering' && !!j.taskId))}
          />
        </div>
      </div>
      {showSettings && (
        <SettingsModal
          t={t} api={api} settings={settings} save={save} keys={keys} setKeys={setKeys}
          secure={boot.secureStorage} providers={boot.providers} onClose={() => setShowSettings(false)} notify={notify}
        />
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-accent/40 bg-ink-800 px-4 py-2.5 text-sm text-slate-100 shadow-glow">{toast}</div>
      )}
    </div>
  );
}
