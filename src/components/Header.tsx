import { Clapperboard, Globe, Settings as Cog, ShieldCheck } from 'lucide-react';
import { dayKey } from '../../core/util';
import type { EngineState } from '../../core/types';
import type { T } from '../i18n';

export function Header({ t, version, state, onSettings }: { t: T; version: string; state: EngineState; onSettings: () => void }) {
  const today = state.stats.byDay[dayKey(Date.now())] ?? 0;
  const proxy = state.connection.proxy;
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-blue-600 shadow-glow">
          <Clapperboard className="h-5 w-5 text-ink-950" />
        </div>
        <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-white">Video Automation <span className="text-accent">Studio</span></h1>
          <span className="rounded-md border border-blue-400/50 bg-blue-500/20 px-2 py-0.5 text-xs font-semibold text-blue-200">v{version}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-ink-600 bg-ink-850/80 px-3.5 py-2">
          {proxy ? <Globe className="h-4 w-4 text-amber-300" /> : <ShieldCheck className="h-4 w-4 text-emerald-400" />}
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-100">{proxy ? t('proxy') : t('direct')}</div>
            <div className="text-xs text-slate-400">{proxy ? t('proxySub') : t('directSub')}</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-indigo-400/40 bg-indigo-500/15 px-3.5 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/70 text-xs font-bold text-white">▶</div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-100">{t('allTime', { n: state.stats.allTime })}</div>
            <div className="text-xs text-slate-400">{t('today', { n: today })}</div>
          </div>
        </div>
        <button className="btn h-11 w-11 p-0" onClick={onSettings} title={t('settings')}><Cog className="h-5 w-5" /></button>
      </div>
    </header>
  );
}
