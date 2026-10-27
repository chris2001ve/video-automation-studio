import { Activity, CheckCircle2, Clock, Pause, Play, Square, XCircle } from 'lucide-react';
import type { EngineState } from '../../core/types';
import type { T } from '../i18n';

export function ActivityPanel({ t, state, onStart, onPause, onResume, onStop, canStart }: {
  t: T; state: EngineState; onStart: () => void; onPause: () => void; onResume: () => void; onStop: () => void; canStart: boolean;
}) {
  const c = { saved: 0, active: 0, failed: 0, queued: 0 };
  for (const j of state.jobs) {
    if (j.state === 'saved') c.saved++;
    else if (j.state === 'waiting') c.queued++;
    else if (j.state === 'error' || j.state === 'review') c.failed++;
    else if (j.state !== 'cancelled') c.active++;
  }
  const card = (label: string, n: number, Icon: typeof Play, cls: string) => (
    <div className={`flex min-w-0 flex-col items-center justify-center rounded-xl border px-1 py-2 sm:px-2 ${cls}`}>
      <div className="flex max-w-full items-center gap-1 text-[11px] font-semibold sm:gap-1.5 sm:text-xs"><Icon className="hidden h-4 w-4 shrink-0 sm:block" /> <span className="truncate">{label}</span></div>
      <div className="mt-1 text-xl font-bold text-white sm:text-2xl">{n}</div>
    </div>
  );
  return (
    <section className="panel order-3 p-3 sm:p-4 lg:order-none">
      <h2 className="panel-title mb-3"><Activity className="h-4 w-4 text-accent" /> {t('activity')}</h2>
      <div className="grid grid-cols-4 gap-2">
        {card(t('saved'), c.saved, CheckCircle2, 'border-emerald-500/60 bg-emerald-600/25 text-emerald-200')}
        {card(t('active'), c.active, Play, 'border-blue-500/60 bg-blue-600/25 text-blue-200')}
        {card(t('failed'), c.failed, XCircle, 'border-rose-500/60 bg-rose-700/30 text-rose-200')}
        {card(t('queued'), c.queued, Clock, 'border-orange-500/60 bg-orange-600/25 text-orange-200')}
      </div>
      <div className="mt-3 flex gap-2">
        {!state.running && (
          <button className="btn btn-accent h-11 min-w-0 flex-1 text-base" onClick={onStart} disabled={!canStart}><Play className="h-5 w-5" /> <span className="truncate">{t('start')}</span></button>
        )}
        {state.running && !state.paused && (
          <button className="btn h-11 flex-1 text-base" onClick={onPause}><Pause className="h-5 w-5" /> {t('pause')}</button>
        )}
        {state.running && state.paused && (
          <button className="btn btn-accent h-11 flex-1 text-base" onClick={onResume}><Play className="h-5 w-5" /> {t('resume')}</button>
        )}
        <button className="btn btn-danger h-11 shrink-0 px-4 text-base sm:w-28" onClick={onStop} disabled={!state.running}><Square className="h-4 w-4" /> {t('stop')}</button>
      </div>
    </section>
  );
}
