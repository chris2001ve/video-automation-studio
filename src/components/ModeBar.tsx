import { FileUp, FolderOpen, Layers, Lightbulb, Settings, Sparkle, Type } from 'lucide-react';
import type { T } from '../i18n';

export type Mode = 'single' | 'multi' | 'preview';

export function ModeBar({ t, mode, setMode, queued, onImport, onFolder, onSettings }: {
  t: T; mode: Mode; setMode: (m: Mode) => void; queued: number; onImport: () => void; onFolder: () => void; onSettings: () => void;
}) {
  const tab = (m: Mode, label: string, Icon: typeof Type) => (
    <button className={`seg flex items-center gap-2 px-4 py-2.5 ${mode === m ? 'seg-on' : ''}`} onClick={() => setMode(m)}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
  return (
    <div className="panel flex flex-wrap items-center gap-2 p-2">
      {tab('single', t('modeSingle'), Type)}
      {tab('multi', t('modeMulti'), Sparkle)}
      {tab('preview', t('modePreview'), Lightbulb)}
      <div className="mx-1 h-7 w-px bg-ink-600" />
      <div className="chip border-blue-400/40 text-blue-100"><Layers className="h-4 w-4 text-blue-300" /> {t('queuedChip', { n: queued })}</div>
      <button className="btn border-sky-400/60 bg-sky-500/80 text-ink-950 hover:bg-sky-400" onClick={onImport}><FileUp className="h-4 w-4" /> {t('import')}</button>
      <button className="btn" onClick={onFolder}><FolderOpen className="h-4 w-4" /> {t('folder')}</button>
      <button className="btn" onClick={onSettings}><Settings className="h-4 w-4" /> {t('settings')}</button>
    </div>
  );
}
