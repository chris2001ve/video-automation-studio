import { Cpu, Gauge, Minus, Plus, Sparkles } from 'lucide-react';
import type { AspectRatio, ProviderId, Resolution, Settings } from '../../core/types';
import { estimateCost, recommendedParallel } from '../../core/util';
import type { KeyName } from '../api';
import type { T } from '../i18n';

const DURATIONS = [5, 10, 15];
const RATIOS: AspectRatio[] = ['9:16', '16:9', '1:1', '4:3', '3:4', '21:9'];
const RESOLUTIONS: Resolution[] = ['480p', '720p', '1080p'];

export function GenerationSettings({ t, settings, save, providers, keys, promptCount, videosToQueue, setVideosToQueue }: {
  t: T; settings: Settings; save: (p: Partial<Settings>) => void; providers: Record<ProviderId, string>; keys: Record<KeyName, boolean>;
  promptCount: number; videosToQueue: number; setVideosToQueue: (n: number) => void;
}) {
  const pv = settings.provider;
  const count = videosToQueue > 0 ? Math.min(videosToQueue, promptCount) : promptCount;
  const price = settings.pricePerSecond[pv] ?? 0;
  const cost = estimateCost(count, settings.variantsPerPrompt, settings.durationSec, price);
  const rec = recommendedParallel(settings.requestsPerMinute[pv] ?? 0);
  const ready = pv === 'mock' || keys[pv as KeyName];

  return (
    <section className="panel p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="panel-title"><Cpu className="h-4 w-4 text-accent" /> {t('genSettings')}</h2>
        <span className={`text-xs font-semibold ${ready ? 'text-emerald-400' : 'text-amber-300'}`}>● {providers[pv]}</span>
      </div>

      <div className="mb-2.5 grid grid-cols-2 gap-2">
        <div>
          <label className="label">{t('provider')}</label>
          <select className="input" value={pv} onChange={(e) => save({ provider: e.target.value as ProviderId })}>
            {(Object.keys(providers) as ProviderId[]).map((id) => <option key={id} value={id}>{providers[id]}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{t('model')}</label>
          <select className="input" value={settings.selectedModel[pv]} onChange={(e) => save({ selectedModel: { ...settings.selectedModel, [pv]: e.target.value } })}>
            {settings.models[pv].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div className="section">{t('video')}</div>
      <label className="label">{t('length')}</label>
      <div className="mb-2.5 grid grid-cols-3 gap-2">
        {DURATIONS.map((d) => (
          <button key={d} className={`seg ${settings.durationSec === d ? 'seg-on' : ''}`} onClick={() => save({ durationSec: d })}>{t('secVideo', { n: d })}</button>
        ))}
      </div>

      <div className="mb-2.5 grid grid-cols-2 gap-2">
        <div>
          <label className="label">{t('aspect')}</label>
          <select className="input" value={settings.aspectRatio} onChange={(e) => save({ aspectRatio: e.target.value as AspectRatio })}>
            {RATIOS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{t('resolution')}</label>
          <select className="input" value={settings.resolution} onChange={(e) => save({ resolution: e.target.value as Resolution })}>
            {RESOLUTIONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <div className="mb-1 grid grid-cols-2 gap-2">
        <div>
          <label className="label">{t('videos')}</label>
          <div className="flex items-center gap-1.5">
            <button className="btn h-9 w-10 p-0" onClick={() => setVideosToQueue(Math.max(0, videosToQueue - 1))}><Minus className="h-4 w-4" /></button>
            <input className="input h-9 text-center" type="number" min={0} value={videosToQueue}
              onChange={(e) => setVideosToQueue(Math.max(0, parseInt(e.target.value || '0', 10)))} />
            <button className="btn h-9 w-10 p-0" onClick={() => setVideosToQueue(videosToQueue + 1)}><Plus className="h-4 w-4" /></button>
          </div>
          <span className="mt-1 block text-[11px] text-slate-500">{t('allHint')}</span>
        </div>
        <div>
          <label className="label">{t('perPrompt')}</label>
          <select className="input h-9" value={settings.variantsPerPrompt} onChange={(e) => save({ variantsPerPrompt: Number(e.target.value) })}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} video{n > 1 ? 's' : ''}</option>)}
          </select>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={settings.generateAudio} onChange={(e) => save({ generateAudio: e.target.checked })} /> {t('audio')}
          </label>
        </div>
      </div>

      <div className="section mt-2">{t('performance')}</div>
      <label className="label">{t('parallel')}</label>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-12 items-center justify-center rounded-xl border border-ink-600 bg-ink-900 text-sm font-semibold">{settings.parallel}</div>
        <input type="range" min={1} max={8} value={settings.parallel} className="flex-1" onChange={(e) => save({ parallel: Number(e.target.value) })} />
        <button className="btn btn-sm border-accent/50 text-accent" onClick={() => save({ parallel: rec })} title={`${rec}`}>
          <Gauge className="h-3.5 w-3.5" /> {t('recommended')}
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        {[1, 2, 4, 6, 8].map((n) => (
          <button key={n} className={`seg h-9 w-10 px-0 ${settings.parallel === n ? 'seg-on' : ''}`} onClick={() => save({ parallel: n })}>{n}</button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl border border-ink-600 bg-ink-900/70 px-3 py-2 text-sm">
        <span className="flex items-center gap-2 text-slate-400"><Sparkles className="h-4 w-4 text-accent" /> {t('estimate')}</span>
        {price > 0
          ? <span className="font-semibold text-slate-100">≈ US$ {cost.toFixed(2)} <span className="text-xs font-normal text-slate-500">({count * settings.variantsPerPrompt} × {settings.durationSec}s)</span></span>
          : <span className="text-xs text-slate-500">{t('estimateNone')}</span>}
      </div>
    </section>
  );
}
