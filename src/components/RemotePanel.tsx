import { Copy, RefreshCw, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import type { RemoteInfo, StudioApi } from '../api';
import type { T } from '../i18n';

/** Ajustes del PC para controlar la app desde el celular en la misma Wi-Fi. */
export function RemotePanel({ t, api, notify }: { t: T; api: StudioApi; notify: (m: string) => void }) {
  const [info, setInfo] = useState<RemoteInfo | null>(null);
  const [port, setPort] = useState('');
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [urlIdx, setUrlIdx] = useState(0);

  useEffect(() => {
    api.remoteInfo?.().then((i) => { setInfo(i); setPort(String(i.port || 8787)); });
    return api.onRemote?.((i) => setInfo(i));
  }, [api]);

  const url = info?.running ? info.urls[urlIdx] ?? info.urls[0] : undefined;
  const link = url && info ? `${url}#k=${info.token}` : '';
  useEffect(() => {
    if (!link) { setQr(null); return; }
    QRCode.toDataURL(link, { margin: 1, width: 220, color: { dark: '#07111f', light: '#ffffff' } }).then(setQr).catch(() => setQr(null));
  }, [link]);

  if (!api.remoteInfo || !info) return null;

  const toggle = async () => {
    setBusy(true);
    const p = Number(port) || 8787;
    setInfo(await api.remoteSet!({ enabled: !info.enabled, port: p }));
    setBusy(false);
  };
  const applyPort = async () => {
    setBusy(true);
    setInfo(await api.remoteSet!({ port: Number(port) || 8787 }));
    setBusy(false);
  };

  return (
    <div className="mb-6 rounded-xl border border-ink-600 bg-ink-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="panel-title"><Smartphone className="h-4 w-4 text-accent" /> {t('remoteTitle')}</h3>
          <p className="mt-1 text-xs text-slate-400">{t('remoteSub')}</p>
        </div>
        <button
          role="switch" aria-checked={info.enabled} disabled={busy} onClick={toggle}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${info.enabled ? 'bg-accent' : 'bg-ink-600'}`}
          title={t('remoteTitle')}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${info.enabled ? 'left-6' : 'left-1'}`} />
        </button>
      </div>

      {info.enabled && info.error && (
        <p className="mt-3 rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{info.error}</p>
      )}

      {info.running && (
        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          <div className="shrink-0 self-center rounded-xl bg-white p-2">
            {qr
              ? <img src={qr} alt={t('remoteScan')} className="h-44 w-44" />
              : <div className="flex h-44 w-44 items-center justify-center p-3 text-center text-xs text-slate-600">{t('remoteNoNet')}</div>}
          </div>
          <div className="min-w-0 flex-1 space-y-3 text-sm">
            <p className="text-slate-300">{t('remoteScan')}</p>
            <div>
              <div className="label">{t('remoteUrl')}</div>
              {info.urls.length > 1 ? (
                <select className="input font-mono text-xs" value={urlIdx} onChange={(e) => setUrlIdx(Number(e.target.value))}>
                  {info.urls.map((u, i) => <option key={u} value={i}>{u}</option>)}
                </select>
              ) : (
                <div className="font-mono text-xs text-cyan-200">{url ?? t('remoteNoNet')}</div>
              )}
            </div>
            <div>
              <div className="label">{t('remoteCode')}</div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg border border-ink-600 bg-ink-950 px-3 py-1.5 font-mono text-lg font-bold tracking-widest text-white">{info.token}</span>
                <button className="btn btn-sm" title={t('copy')} onClick={async () => { await navigator.clipboard.writeText(link); notify(t('copied')); }}><Copy className="h-3.5 w-3.5" /></button>
                <button className="btn btn-sm" title={t('remoteRegen')} onClick={async () => { setInfo(await api.remoteRegen!()); notify(t('remoteRegenDone')); }}><RefreshCw className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('remoteRegen')}</span></button>
              </div>
            </div>
            <p className={`text-xs ${info.clients ? 'text-emerald-300' : 'text-slate-500'}`}>{t('remoteClients', { n: info.clients })}</p>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="label">{t('remotePort')}</label>
          <input className="input w-28 font-mono text-xs" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, '').slice(0, 5))} />
        </div>
        <button className="btn" disabled={busy || String(info.port) === port} onClick={applyPort}>{t('save')}</button>
      </div>
      <p className="mt-3 text-xs text-slate-500">{t('remoteHelp')}</p>
    </div>
  );
}
