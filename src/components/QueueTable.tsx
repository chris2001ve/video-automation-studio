import { Copy, ExternalLink, FolderSearch, Info, ListOrdered, RotateCcw, Trash2, X } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import type { EngineState, Job, JobState, ProviderId } from '../../core/types';
import type { StudioApi } from '../api';
import type { T, TKey } from '../i18n';

const STATE_STYLE: Record<JobState, string> = {
  waiting: 'text-slate-300', sending: 'text-sky-300', rendering: 'text-accent', downloading: 'text-indigo-300',
  saved: 'text-emerald-400', error: 'text-rose-400', review: 'text-amber-300', cancelled: 'text-slate-500',
};

function elapsed(job: Job, now: number) {
  if (!job.startedAt) return '';
  const s = Math.floor(((job.finishedAt ?? now) - job.startedAt) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function QueueTable({ t, state, api, providers }: { t: T; state: EngineState; api: StudioApi; providers: Record<ProviderId, string> }) {
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);

  const jobs = state.jobs;
  const c = { saved: 0, active: 0, pending: 0, failed: 0 };
  for (const j of jobs) {
    if (j.state === 'saved') c.saved++;
    else if (j.state === 'waiting') c.pending++;
    else if (j.state === 'error' || j.state === 'review') c.failed++;
    else if (j.state !== 'cancelled') c.active++;
  }
  const total = jobs.filter((j) => j.state !== 'cancelled').length;

  return (
    <section className="panel order-4 flex min-h-[220px] flex-col p-3 sm:p-4 lg:order-none lg:flex-[1.25]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="panel-title sm:whitespace-nowrap"><ListOrdered className="h-4 w-4 text-accent" /> {t('queueTitle')} <span className="text-accent">({jobs.length})</span></h2>
          {total > 0 && <div className="mt-0.5 truncate pl-6 text-xs text-accent/90">● {t('queueSummary', { a: c.active, t: total, s: c.saved, p: c.pending })}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {c.failed > 0 && <button className="btn btn-sm" onClick={() => api.retryFailed()}><RotateCcw className="h-3.5 w-3.5" /> {t('retryFailed')}</button>}
          <button className="btn btn-sm" onClick={() => api.clearFinished()} disabled={!jobs.length} title={t('clearFinished')}><Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('clearFinished')}</span></button>
        </div>
      </div>
      <div className="space-y-2 lg:hidden">
        {jobs.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{t('emptyQueue')}</p>}
        {jobs.map((j) => {
          const busy = ['sending', 'rendering', 'downloading'].includes(j.state);
          return (
            <div key={j.id} className="rounded-xl border border-ink-700 bg-ink-900/60 p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className={`text-sm font-semibold ${STATE_STYLE[j.state]}`}>{t(`st_${j.state}` as TKey)}</span>
                <span className="font-mono text-xs text-slate-500">#{j.index}{j.variant > 1 ? `.${j.variant}` : ''} · {j.params.durationSec}s · {j.params.aspectRatio}</span>
              </div>
              <p className="line-clamp-2 text-sm text-slate-200">{j.prompt}</p>
              {busy && (
                <div className="mt-2">
                  <div className="mb-1 flex justify-between text-[11px] text-slate-400"><span>{j.progress !== undefined ? `${j.progress}%` : ''}</span><span className="font-mono">{elapsed(j, now)}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
                    <div className={`h-full rounded-full bg-gradient-to-r from-accent to-blue-500 ${j.progress === undefined ? 'w-1/3 animate-pulse' : ''}`} style={j.progress !== undefined ? { width: `${j.progress}%` } : undefined} />
                  </div>
                </div>
              )}
              {j.state === 'saved' && j.outputPath && <p className="mt-1.5 truncate text-xs text-emerald-300">{j.outputPath.split(/[\\/]/).pop()}</p>}
              {!busy && j.error && <p className="mt-1.5 line-clamp-2 text-xs text-rose-300/90">{j.error}</p>}
              <div className="mt-2 flex justify-end gap-1">
                {(j.state === 'error' || j.state === 'review' || j.state === 'cancelled') && <IconBtn title={t('retry')} onClick={() => api.retry(j.id)}><RotateCcw /></IconBtn>}
                <IconBtn title={t('duplicate')} onClick={() => api.duplicate(j.id)}><Copy /></IconBtn>
                {busy || j.state === 'waiting'
                  ? <IconBtn title={t('cancel')} onClick={() => api.cancel(j.id)} danger><X /></IconBtn>
                  : <IconBtn title={t('remove')} onClick={() => api.remove(j.id)} danger><Trash2 /></IconBtn>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="hidden min-h-0 flex-1 overflow-auto rounded-xl border border-ink-700 lg:block">
        <table className="w-full table-fixed text-left text-[13px]">
          <thead className="sticky top-0 z-10 bg-ink-800 text-xs text-slate-400">
            <tr>
              <th className="w-12 px-3 py-2 font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">{t('colPrompt')}</th>
              <th className="w-32 px-3 py-2 font-semibold">{t('colProvider')}</th>
              <th className="w-32 px-3 py-2 font-semibold">{t('colStatus')}</th>
              <th className="w-44 px-3 py-2 font-semibold">{t('colOutput')}</th>
              <th className="w-[104px] px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-500">{t('emptyQueue')}</td></tr>
            )}
            {jobs.map((j) => {
              const busy = ['sending', 'rendering', 'downloading'].includes(j.state);
              return (
                <Fragment key={j.id}>
                  <tr className="border-t border-ink-700/70 hover:bg-ink-800/50">
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{j.index}{j.variant > 1 ? `.${j.variant}` : ''}</td>
                    <td className="truncate px-3 py-2 font-medium text-slate-200" title={j.prompt}>{j.prompt}</td>
                    <td className="truncate px-3 py-2 text-xs text-slate-400" title={j.params.model}>{providers[j.params.provider]}<br /><span className="text-slate-500">{j.params.durationSec}s · {j.params.aspectRatio}</span></td>
                    <td className={`px-3 py-2 font-semibold ${STATE_STYLE[j.state]}`}>
                      {t(`st_${j.state}` as TKey)}
                      {j.attempts > 0 && j.state !== 'saved' && <span className="ml-1 text-[11px] font-normal text-slate-500">({j.attempts})</span>}
                    </td>
                    <td className="px-3 py-2">
                      {j.state === 'saved' && j.outputPath ? (
                        <button className="flex max-w-full items-center gap-1.5 truncate text-xs text-emerald-300 hover:underline" onClick={() => api.openPath(j.outputPath!)} title={j.outputPath}>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{j.outputPath.split(/[\\/]/).pop()}</span>
                        </button>
                      ) : busy ? (
                        <div>
                          <div className="mb-1 flex justify-between text-[11px] text-slate-400"><span>{j.progress !== undefined ? `${j.progress}%` : t(`st_${j.state}` as TKey)}</span><span className="font-mono">{elapsed(j, now)}</span></div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
                            <div className={`h-full rounded-full bg-gradient-to-r from-accent to-blue-500 ${j.progress === undefined ? 'w-1/3 animate-pulse' : ''}`} style={j.progress !== undefined ? { width: `${j.progress}%` } : undefined} />
                          </div>
                        </div>
                      ) : j.error ? (
                        <span className="line-clamp-2 text-xs text-rose-300/90" title={j.error}>{j.error}</span>
                      ) : <span className="text-xs text-slate-500">—</span>}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex justify-end gap-0.5">
                        {(j.state === 'error' || j.state === 'review' || j.state === 'cancelled') && <IconBtn title={t('retry')} onClick={() => api.retry(j.id)}><RotateCcw /></IconBtn>}
                        {j.state === 'saved' && j.outputPath && <IconBtn title={t('reveal')} onClick={() => api.reveal(j.outputPath!)}><FolderSearch /></IconBtn>}
                        <IconBtn title={t('duplicate')} onClick={() => api.duplicate(j.id)}><Copy /></IconBtn>
                        <IconBtn title={t('details')} onClick={() => setOpen(open === j.id ? null : j.id)}><Info /></IconBtn>
                        {busy || j.state === 'waiting'
                          ? <IconBtn title={t('cancel')} onClick={() => api.cancel(j.id)} danger><X /></IconBtn>
                          : <IconBtn title={t('remove')} onClick={() => api.remove(j.id)} danger><Trash2 /></IconBtn>}
                      </div>
                    </td>
                  </tr>
                  {open === j.id && (
                    <tr className="bg-ink-900/80">
                      <td colSpan={6} className="px-4 py-3 text-xs text-slate-300">
                        <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5">
                          <dt className="text-slate-500">{t('details_prompt')}</dt><dd className="whitespace-pre-wrap">{j.prompt}</dd>
                          <dt className="text-slate-500">{t('details_params')}</dt><dd className="font-mono">{j.params.model} · {j.params.durationSec}s · {j.params.aspectRatio} · {j.params.resolution}{j.params.negativePrompt ? ` · avoid: ${j.params.negativePrompt}` : ''}</dd>
                          {j.taskId && <><dt className="text-slate-500">{t('details_task')}</dt><dd className="font-mono">{j.taskId}</dd></>}
                          {j.error && <><dt className="text-slate-500">{t('details_error')}</dt><dd className="text-rose-300">{j.error}</dd></>}
                          {j.outputPath && <><dt className="text-slate-500">{t('details_file')}</dt><dd className="font-mono">{j.outputPath}</dd></>}
                        </dl>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IconBtn({ children, title, onClick, danger }: { children: React.ReactElement<{ className?: string }>; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button title={title} onClick={onClick} className={`rounded-md p-2 text-slate-400 lg:p-1.5 transition hover:bg-ink-700 ${danger ? 'hover:text-rose-400' : 'hover:text-accent'}`}>
      <span className="block h-3.5 w-3.5 [&>svg]:h-3.5 [&>svg]:w-3.5">{children}</span>
    </button>
  );
}
