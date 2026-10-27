import { ProviderError } from './backoff';
import { requestJson, type FetchFn } from './providers/http';

const INSTRUCTION = `You are an expert prompt writer for AI text-to-video models (Seedance).
Rewrite each prompt to be vivid, cinematic and specific: subject, action, setting, camera movement,
lighting, mood and style. Keep the original language and intent, keep any character-consistency details,
and keep each prompt under 900 characters. Return ONLY the rewritten prompts, one per block,
separated by a line containing exactly ---`;

/** Mejora prompts con la API de Gemini (generativelanguage.googleapis.com). */
export async function enhancePrompts(prompts: string[], apiKey: string, model: string, fetchFn: FetchFn): Promise<string[]> {
  if (!apiKey) throw new ProviderError('Falta la API key de Gemini (Ajustes)', 401);
  const body = await requestJson(fetchFn,
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: prompts.join('\n---\n') }] }],
        generationConfig: { temperature: 0.8 },
      }),
    });
  const text: string = body?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
  const out = text.split(/\n\s*-{3,}\s*\n/).map((s) => s.trim()).filter(Boolean);
  if (out.length === 0) throw new ProviderError('Gemini no devolvió texto', 502);
  return out;
}
