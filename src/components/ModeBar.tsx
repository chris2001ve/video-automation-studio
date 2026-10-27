import { FileUp, FolderOpen, Layers, Lightbulb, Settings, Sparkle, Type } from 'lucide-react';
import type { T } from '../i18n';

export type Mode = 'single' | 'multi' | 'preview';

export function ModeBar({ t, mode, setMode, queued, onImport, onFolder, onSettings }: {
  t: T; mode: Mode; setMode: (m: Mode) => void; queued: number; onImport: () => void; onFolder?: () => void; onSettings: () => void;
}) {
  const tab = (m: Mode, label: string, Icon: typeof Type) => (
    <button className={`seg flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2 sm:px-4 sm:py-2.5 ${mode === m ? 'seg-on' : ''}`} onClick={() => setMode(m)}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
  return (
    <div className="panel flex items-center gap-2 overflow-x-auto p-2 lg:flex-wrap">
      {tab('single', t('modeSingle'), Type)}
      {tab('multi', t('modeMulti'), Sparkle)}
      {tab('preview', t('modePreview'), Lightbulb)}
      <div className="mx-1 h-7 w-px bg-ink-600" />
      <div className="chip shrink-0 whitespace-nowrap border-blue-400/40 text-blue-100"><Layers className="h-4 w-4 text-blue-300" /> {t('queuedChip', { n: queued })}</div>
      <button className="btn shrink-0 whitespace-nowrap border-sky-400/60 bg-sky-500/80 text-ink-950 hover:bg-sky-400" onClick={onImport}><FileUp className="h-4 w-4" /> {t('import')}</button>
      {onFolder && <button className="btn shrink-0 whitespace-nowrap" onClick={onFolder}><FolderOpen className="h-4 w-4" /> {t('folder')}</button>}
      <button className="btn shrink-0 whitespace-nowrap" onClick={onSettings}><Settings className="h-4 w-4" /> {t('settings')}</button>
    </div>
  );
}
