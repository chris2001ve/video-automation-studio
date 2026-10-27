import { CheckCircle2, FolderOpen, KeyRound, Network, Plug, X } from 'lucide-react';
import { useState } from 'react';
import type { ProviderId, Settings } from '../../core/types';
import type { KeyName, StudioApi } from '../api';
import type { T } from '../i18n';

const KEY_INFO: { id: KeyName; label: string; url: string; provider?: ProviderId }[] = [
  { id: 'fal', label: 'fal.ai', url: 'https://fal.ai/dashboard/keys', provider: 'fal' },
  { id: 'byteplus', label: 'BytePlus ModelArk', url: 'https://console.byteplus.com/ark/region:ark+ap-southeast-1/apiKey', provider: 'byteplus' },
  { id: 'gemini', label: 'Google Gemini', url: 'https://aistudio.google.com/apikey' },
];

export function SettingsModal({ t, api, settings, save, keys, setKeys, secure, providers, onClose, notify }: {
  t: T; api: StudioApi; settings: Settings; save: (p: Partial<Settings>) => void; keys: Record<KeyName, boolean>;
  setKeys: (k: Record<KeyName, boolean>) => void; secure: boolean; providers: Record<ProviderId, string>; onClose: () => void; notify: (m: string) => void;
}) {
  const [draft, setDraft] = useState<Record<KeyName, string>>({ fal: '', byteplus: '', gemini: '' });
  const [testing, setTesting] = useState<string | null>(null);
  const [proxy, setProxy] = useState(settings.proxyUrl);
  const real: ProviderId[] = ['fal', 'byteplus'];

  const saveKey = async (id: KeyName, value: string) => {
    setKeys(await api.setKey(id, value));
    setDraft((d) => ({ ...d, [id]: '' }));
    notify(value ? `${t('saved_')} ✓` : t('delete'));
  };
  const test = async (id: ProviderId) => {
    setTesting(id);
    const r = await api.testProvider(id);
    setTesting(null);
    notify(`${r.ok ? '✓' : '✗'} ${r.message}`);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="panel max-h-full w-full max-w-3xl overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">{t('settings')}</h2>
          <button className="btn btn-ghost h-9 w-9 p-0" onClick={onClose} title={t('close')}><X className="h-5 w-5" /></button>
        </div>

        <h3 className="panel-title mb-1"><KeyRound className="h-4 w-4 text-accent" /> {t('apiKeys')}</h3>
        <p className="mb-3 text-xs text-slate-400">{t('apiKeysHint')}</p>
        {!secure && <p className="mb-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{t('insecure')}</p>}
        <div className="space-y-3">
          {KEY_INFO.map((k) => (
            <div key={k.id} className="rounded-xl border border-ink-600 bg-ink-900/60 p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <a className="font-semibold text-slate-100 hover:text-accent" href={k.url} target="_blank" rel="noreferrer">{k.label} ↗</a>
                {keys[k.id] ? <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> {t('saved_')}</span> : <span className="text-xs text-slate-500">{t('notSet')}</span>}
              </div>
              <div className="flex gap-2">
                <input className="input font-mono" type="password" autoComplete="off" placeholder={keys[k.id] ? '••••••••••••' : 'API key'}
                  value={draft[k.id]} onChange={(e) => setDraft({ ...draft, [k.id]: e.target.value })} />
                <button className="btn btn-accent" disabled={!draft[k.id].trim()} onClick={() => saveKey(k.id, draft[k.id])}>{t('save')}</button>
                {k.provider && <button className="btn" disabled={!keys[k.id] || testing === k.provider} onClick={() => test(k.provider!)}><Plug className="h-4 w-4" /> {t('test')}</button>}
                {keys[k.id] && <button className="btn btn-ghost text-rose-300" onClick={() => saveKey(k.id, '')}>{t('delete')}</button>}
              </div>
              {k.id === 'gemini' && (
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                  {t('geminiModel')}
                  <input className="input w-56 py-1 text-xs" value={settings.geminiModel} onChange={(e) => save({ geminiModel: e.target.value })} />
                </div>
              )}
            </div>
          ))}
        </div>

        <h3 className="panel-title mb-3 mt-6"><Network className="h-4 w-4 text-accent" /> {t('network')} · {t('output')}</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('proxyUrl')}</label>
            <div className="flex gap-2">
              <input className="input font-mono text-xs" value={proxy} onChange={(e) => setProxy(e.target.value)} placeholder="http://127.0.0.1:8080" />
              <button className="btn" onClick={() => save({ proxyUrl: proxy.trim() })} disabled={proxy.trim() === settings.proxyUrl}>{t('save')}</button>
            </div>
          </div>
          <div>
            <label className="label">{t('output')}</label>
            <div className="flex gap-2">
              <input className="input truncate text-xs" value={settings.outputDir} readOnly title={settings.outputDir} />
              <button className="btn" onClick={async () => { const d = await api.chooseFolder(); if (d) save({ outputDir: d }); }}><FolderOpen className="h-4 w-4" /> {t('change')}</button>
            </div>
          </div>
          <div>
            <label className="label">{t('language')}</label>
            <select className="input" value={settings.language} onChange={(e) => save({ language: e.target.value as 'es' | 'en' })}>
              <option value="es">Español</option><option value="en">English</option>
            </select>
          </div>
        </div>

        <h3 className="panel-title mb-3 mt-6">{t('queueCfg')}</h3>
        <div className="grid grid-cols-2 gap-3">
          <Num label={t('maxRetries')} value={settings.maxRetries} min={0} max={10} onChange={(v) => save({ maxRetries: v })} />
          <Num label={t('pollInterval')} value={settings.pollIntervalSec} min={2} max={120} onChange={(v) => save({ pollIntervalSec: v })} />
          {real.map((p) => (
            <Num key={'r' + p} label={t('rpm', { p: providers[p] })} value={settings.requestsPerMinute[p]} min={0} max={600}
              onChange={(v) => save({ requestsPerMinute: { ...settings.requestsPerMinute, [p]: v } })} />
          ))}
          {real.map((p) => (
            <Num key={'c' + p} label={t('pricing', { p: providers[p] })} value={settings.pricePerSecond[p]} min={0} max={10} step={0.001}
              onChange={(v) => save({ pricePerSecond: { ...settings.pricePerSecond, [p]: v } })} />
          ))}
        </div>

        <h3 className="panel-title mb-3 mt-6">{t('model')}</h3>
        <div className="grid grid-cols-2 gap-3">
          {real.map((p) => (
            <div key={p}>
              <label className="label">{t('models', { p: providers[p] })}</label>
              <textarea className="input h-24 font-mono text-xs" defaultValue={settings.models[p].join('\n')}
                onBlur={(e) => {
                  const list = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
                  if (!list.length) return;
                  save({ models: { ...settings.models, [p]: list }, selectedModel: { ...settings.selectedModel, [p]: list.includes(settings.selectedModel[p]) ? settings.selectedModel[p] : list[0] } });
                }} />
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end"><button className="btn btn-accent px-6" onClick={onClose}>{t('close')}</button></div>
      </div>
    </div>
  );
}

function Num({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" type="number" min={min} max={max} step={step} value={value}
        onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v))); }} />
    </div>
  );
}
