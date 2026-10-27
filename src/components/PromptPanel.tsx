import { Bot, ListPlus, Trash2, Wand2, X } from 'lucide-react';
import type { PromptItem, Settings } from '../../core/types';
import type { T } from '../i18n';
import type { Mode } from './ModeBar';

interface Props {
  t: T; mode: Mode; text: string; setText: (v: string) => void; single: string; setSingle: (v: string) => void;
  prompts: PromptItem[]; settings: Settings; save: (p: Partial<Settings>) => void; enhancing: boolean;
  onEnhance: () => void; onAdd: () => void; onRemove: (i: number) => void; canEnhance: boolean;
}

export function PromptPanel(p: Props) {
  const { t, mode, settings } = p;
  const chars = mode === 'single' ? p.single.length : p.text.length;
  return (
    <section className="panel order-1 flex min-h-[340px] flex-col p-3 sm:p-4 lg:order-none lg:min-h-[220px] lg:flex-1">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="panel-title"><Wand2 className="h-4 w-4 text-accent" />
          {mode === 'single' ? t('promptTitle') : t('promptsTitle', { n: p.prompts.length })}
        </h2>
        <div className="flex items-center gap-4 text-xs">
          <button
            className={`flex items-center gap-1.5 font-medium ${p.canEnhance ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-500'}`}
            onClick={p.onEnhance} disabled={p.enhancing || p.prompts.length === 0}
            title={p.canEnhance ? t('enhance') : 'Gemini API key → Ajustes'}
          >
            <Bot className="h-4 w-4" /> {p.enhancing ? t('enhancing') : t('enhance')}
          </button>
          <span className="text-slate-400">{t('chars', { n: chars.toLocaleString() })}</span>
        </div>
      </div>

      {mode === 'preview' ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {p.prompts.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{t('previewEmpty')}</p>}
          {p.prompts.map((item, i) => (
            <div key={i} className="group flex gap-3 rounded-xl border border-ink-600 bg-ink-900/70 p-3">
              <span className="flex h-6 w-8 shrink-0 items-center justify-center rounded-md bg-accent/15 text-xs font-bold text-accent">{i + 1}</span>
              <p className="line-clamp-3 flex-1 whitespace-pre-wrap text-sm text-slate-300">{item.prompt}</p>
              <div className="flex shrink-0 flex-col items-end gap-1 text-[11px] text-slate-500">
                {item.durationSec && <span>{item.durationSec}s</span>}
                {item.aspectRatio && <span>{item.aspectRatio}</span>}
                <button className="opacity-0 transition group-hover:opacity-100" onClick={() => p.onRemove(i)} title={t('remove')}><X className="h-4 w-4 text-rose-400" /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <textarea
          className="input min-h-[150px] flex-1 resize-none lg:min-h-0 font-mono text-[13px] leading-relaxed"
          value={mode === 'single' ? p.single : p.text}
          onChange={(e) => (mode === 'single' ? p.setSingle(e.target.value) : p.setText(e.target.value))}
          placeholder={mode === 'single' ? t('placeholderSingle') : t('placeholderMulti')}
          spellCheck={false}
        />
      )}

      <input
        className="input mt-2 text-xs"
        value={settings.negativePrompt}
        onChange={(e) => p.save({ negativePrompt: e.target.value })}
        placeholder={`${t('negative')}: ${t('negativePh')}`}
        title={t('negative')}
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {mode !== 'single' && (
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-300">
              {t('onePerLine')}
              <button
                className={`relative h-6 w-11 rounded-full transition ${settings.onePromptPerLine ? 'bg-accent' : 'bg-ink-600'}`}
                onClick={() => p.save({ onePromptPerLine: !settings.onePromptPerLine })}
                aria-pressed={settings.onePromptPerLine}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${settings.onePromptPerLine ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </label>
          )}
          {mode !== 'preview' && (
            <button className="btn btn-ghost btn-sm text-slate-400" onClick={() => (mode === 'single' ? p.setSingle('') : p.setText(''))}>
              <Trash2 className="h-3.5 w-3.5" /> {t('clearEditor')}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${p.prompts.length ? 'text-emerald-400' : 'text-slate-500'}`}>
            {p.prompts.length ? t('detected', { n: p.prompts.length }) : t('noneDetected')}
          </span>
          <button className="btn btn-sm" onClick={p.onAdd} disabled={!p.prompts.length}><ListPlus className="h-4 w-4" /> {t('addToQueue')}</button>
        </div>
      </div>
    </section>
  );
}
