import { Clapperboard, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { makeT } from '../i18n';

/** Pantalla del celular para escribir el código de acceso del PC. */
export function PairingScreen({ error, onSubmit }: { error: string | null; onSubmit: (code: string) => void }) {
  const t = makeT(navigator.language?.startsWith('en') ? 'en' : 'es');
  const [code, setCode] = useState('');
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const pretty = clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form
        className="panel w-full max-w-sm p-6"
        onSubmit={(e) => { e.preventDefault(); if (clean.length === 8) onSubmit(pretty); }}
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-blue-600 shadow-glow">
            <Clapperboard className="h-5 w-5 text-ink-950" />
          </div>
          <div className="text-lg font-bold text-white">Video Automation <span className="text-accent">Studio</span></div>
        </div>
        <h1 className="panel-title mb-2"><Smartphone className="h-4 w-4 text-accent" /> {t('pairTitle')}</h1>
        <p className="mb-4 text-sm text-slate-400">{t('pairBody')}</p>
        <input
          className="input text-center font-mono text-2xl font-bold tracking-[0.3em]"
          value={pretty} onChange={(e) => setCode(e.target.value)}
          placeholder="ABCD-2345" autoFocus autoCapitalize="characters" autoComplete="one-time-code" spellCheck={false}
          aria-label={t('remoteCode')}
        />
        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
        <button className="btn btn-accent mt-4 h-11 w-full text-base" disabled={clean.length !== 8}>{t('pairConnect')}</button>
      </form>
    </div>
  );
}
