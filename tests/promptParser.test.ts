import { describe, expect, it } from 'vitest';
import { buildPromptText, csvToPromptItems, importText, parseCsv, parsePrompts } from '../core/promptParser';

describe('parsePrompts', () => {
  it('un prompt por línea', () => {
    expect(parsePrompts('a\n\n b \r\nc', true)).toEqual(['a', 'b', 'c']);
  });
  it('separa por líneas en blanco y ---', () => {
    const t = 'Escena 1\nlínea 2\n\nEscena 2\n---\nEscena 3';
    expect(parsePrompts(t, false)).toEqual(['Escena 1\nlínea 2', 'Escena 2', 'Escena 3']);
  });
  it('texto vacío', () => {
    expect(parsePrompts('   \n\n', false)).toEqual([]);
  });
});

describe('CSV', () => {
  it('maneja comillas, comas y saltos de línea', () => {
    expect(parseCsv('a,"b, c","d ""e"""\n"x\ny",z')).toEqual([['a', 'b, c', 'd "e"'], ['x\ny', 'z']]);
  });
  it('lee columnas opcionales', () => {
    const items = csvToPromptItems('prompt,negative_prompt,duration,aspect_ratio\n"Un dragón",blur,15,16:9\nOtro,,,99:1');
    expect(items).toEqual([
      { prompt: 'Un dragón', negativePrompt: 'blur', durationSec: 15, aspectRatio: '16:9' },
      { prompt: 'Otro' },
    ]);
  });
  it('sin encabezado usa la primera columna', () => {
    expect(csvToPromptItems('uno\ndos')).toEqual([{ prompt: 'uno' }, { prompt: 'dos' }]);
  });
  it('importText elige el formato por extensión', () => {
    expect(importText('lista.TXT', 'a\nb', true)).toHaveLength(2);
    expect(importText('lista.csv', 'prompt\na', true)).toEqual([{ prompt: 'a' }]);
  });
});

describe('buildPromptText', () => {
  it('agrega el prompt negativo', () => {
    expect(buildPromptText(' hola ', 'blur')).toBe('hola\n\nAvoid: blur');
    expect(buildPromptText('hola', '')).toBe('hola');
  });
});
