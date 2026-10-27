import type { AspectRatio, PromptItem } from './types';

/**
 * Divide el texto en prompts.
 * - onePerLine=true: cada línea no vacía es un prompt.
 * - onePerLine=false: los prompts se separan por una línea "---" o por una o más líneas en blanco.
 */
export function parsePrompts(text: string, onePerLine: boolean): string[] {
  const normalized = text.replace(/\r\n?/g, '\n');
  if (onePerLine) {
    return normalized.split('\n').map((l) => l.trim()).filter(Boolean);
  }
  return normalized
    .split(/\n\s*-{3,}\s*\n|\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0 && !/^-{3,}$/.test(b));
}

/** Parser CSV mínimo compatible con RFC 4180 (comillas, comas y saltos de línea dentro de comillas). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',' || c === ';') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

const RATIOS: AspectRatio[] = ['9:16', '16:9', '1:1', '4:3', '3:4', '21:9'];

/**
 * Convierte un CSV en PromptItems. Columnas reconocidas (encabezado opcional):
 * prompt, negative_prompt, duration, aspect_ratio. Sin encabezado: la primera columna es el prompt.
 */
export function csvToPromptItems(text: string): PromptItem[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const hasHeader = header.includes('prompt');
  const idx = (name: string) => header.indexOf(name);
  const body = hasHeader ? rows.slice(1) : rows;
  const items: PromptItem[] = [];
  for (const r of body) {
    const prompt = (hasHeader ? r[idx('prompt')] : r[0])?.trim();
    if (!prompt) continue;
    const item: PromptItem = { prompt };
    if (hasHeader) {
      const neg = idx('negative_prompt') >= 0 ? r[idx('negative_prompt')]?.trim() : '';
      if (neg) item.negativePrompt = neg;
      const dur = idx('duration') >= 0 ? parseInt(r[idx('duration')] ?? '', 10) : NaN;
      if (Number.isFinite(dur) && dur > 0) item.durationSec = dur;
      const ar = idx('aspect_ratio') >= 0 ? (r[idx('aspect_ratio')]?.trim() as AspectRatio) : undefined;
      if (ar && RATIOS.includes(ar)) item.aspectRatio = ar;
    }
    items.push(item);
  }
  return items;
}

export function importText(fileName: string, content: string, onePerLine: boolean): PromptItem[] {
  if (fileName.toLowerCase().endsWith('.csv')) return csvToPromptItems(content);
  return parsePrompts(content, onePerLine).map((prompt) => ({ prompt }));
}

/** Agrega el prompt negativo al texto (los modelos Seedance no tienen un campo dedicado). */
export function buildPromptText(prompt: string, negative?: string): string {
  const neg = negative?.trim();
  return neg ? `${prompt.trim()}\n\nAvoid: ${neg}` : prompt.trim();
}
