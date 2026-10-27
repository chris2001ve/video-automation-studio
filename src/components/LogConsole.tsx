import { ClipboardCopy, Download, Terminal, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { LogEntry } from '../../core/types';
import type { StudioApi } from '../api';
import type { T } from '../i18n';

const COLORS = { info: 'text-slate-300', warn: 'text-amber-300', error: 'text-rose-400', success: 'text-emerald-400' };
const fmt = (ts: number) => new Date(ts).toLocaleTimeString('es-CO', { hour12: false });
const line = (l: LogEntry) => `[${fmt(l.ts)}] ${l.level.toUpperCase().padEnd(7)} ${l.message}`;

export function LogConsole({ t, logs, api, onClear, notify }: { t: T; logs: LogEntry[]; api: StudioApi; onClear: () => void; notify: (m: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [logs]);
  const text = () => logs.map(line).join('\n');
  return (
    <section className="panel order-5 flex h-56 shrink-0 flex-col p-3 lg:order-none lg:h-48">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="panel-title"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/80"><Terminal className="h-3.5 w-3.5 text-white" /></span> {t('liveActivity')}</h2>
        <div className="flex gap-2">
          <button className="btn btn-sm" title={t('exportLogs')} onClick={() => api.exportLogs(text())}><Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('exportLogs')}</span></button>
          <button className="btn btn-sm" title={t('copyLogs')} onClick={async () => { await navigator.clipboard.writeText(text()); notify(t('copied')); }}><ClipboardCopy className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('copyLogs')}</span></button>
          <button title={t('clearLogs')} className="btn btn-sm border-rose-500/60 bg-rose-600/70 text-white hover:bg-rose-500" onClick={async () => { await api.clearLogs(); onClear(); }}><Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('clearLogs')}</span></button>
        </div>
      </div>
      <div ref={ref} className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-ink-700 bg-ink-950/80 px-3 py-2 font-mono text-[12px] leading-5">
        {logs.map((l, i) => (
          <div key={i} className={COLORS[l.level]}><span className="text-slate-500">[{fmt(l.ts)}]</span> {l.message}</div>
        ))}
      </div>
    </section>
  );
}
