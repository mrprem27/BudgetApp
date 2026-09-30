/**
 * Thin proxy for the app's cloud receipt-scan provider (src/lib/ocrProviders/gemini.ts).
 * Holds the Gemini API key server-side — the app never sees it, never ships it in the
 * bundle. Takes a base64 photo, asks Gemini Flash's free tier for structured line items
 * via responseSchema (so the model's output is guaranteed-parseable JSON, no regex here),
 * and returns them. See README.md for deploy steps.
 */

import { normalizeItems } from './normalize';

export interface Env {
  GEMINI_API_KEY: string;
}

// Google rotates the concrete Flash model surprisingly fast (a hardcoded
// 'gemini-2.5-flash' 404'd for new API keys within weeks) — 'gemini-flash-latest'
// is Google's own floating alias that always points at the current GA Flash
// model, trading pinned reproducibility (not needed for a best-effort personal
// feature) for not having to chase renames by hand. Still a plain code
// constant if you ever want to pin a specific dated model instead.
//
// Tried in order: the lighter model takes the request when Flash answers "high demand" (503) or
// rate-limits (429), which on the free tier is most of the time at busy hours.
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-flash-latest'];
const RETRYABLE = new Set([429, 500, 503, 504]);

const PROMPT = `You are reading a photo of a retail or restaurant receipt. Extract every purchased line item as a JSON array of {name, qty, amount}.

Rules:
- "amount" is the figure printed at the END of that item's line (its line total, already multiplied by the quantity), as a plain decimal string: no currency symbol, no thousands commas.
- "qty" is the printed quantity as a plain integer string; use "1" if none is printed.
- Do NOT include tax, subtotal, total, discount, service charge, round-off, or any other non-item line.
- If an item's name wraps across two lines, merge it into a single "name".
- Return only the JSON array — no prose, no markdown fences.`;

const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      name: { type: 'STRING' },
      qty: { type: 'STRING' },
      amount: { type: 'STRING' },
    },
    required: ['name', 'qty', 'amount'],
  },
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }
    if (!env.GEMINI_API_KEY) {
      return json({ error: 'Server misconfigured: GEMINI_API_KEY is not set' }, 500);
    }

    let body: { imageBase64?: unknown; mimeType?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    if (typeof body.imageBase64 !== 'string' || !body.imageBase64) {
      return json({ error: 'imageBase64 (string) is required' }, 400);
    }
    const mimeType = typeof body.mimeType === 'string' && body.mimeType ? body.mimeType : 'image/jpeg';

    const payload = JSON.stringify({
      contents: [{
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: mimeType, data: body.imageBase64 } },
        ],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    let geminiResponse: Response | null = null;
    let lastError = '';
    for (const [i, model] of GEMINI_MODELS.entries()) {
      if (i > 0) await new Promise(r => setTimeout(r, 800 * i));
      try {
        geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload },
        );
      } catch (networkError) {
        lastError = networkError instanceof Error ? networkError.message : String(networkError);
        geminiResponse = null;
        continue;
      }
      if (geminiResponse.ok || !RETRYABLE.has(geminiResponse.status)) break;
      lastError = `${model}: ${geminiResponse.status}`;
    }

    if (!geminiResponse) {
      return json({ error: `Could not reach Gemini: ${lastError}` }, 502);
    }
    if (!geminiResponse.ok) {
      const detail = await geminiResponse.text().catch(() => '');
      return json({ error: `Gemini request failed (${geminiResponse.status})`, detail: detail.slice(0, 500) }, 502);
    }

    const geminiData = await geminiResponse.json().catch(() => null) as
      { candidates?: { content?: { parts?: { text?: unknown }[] } }[] } | null;
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') {
      return json({ error: 'Unexpected Gemini response shape', detail: JSON.stringify(geminiData).slice(0, 500) }, 502);
    }

    let lines: unknown;
    try {
      lines = JSON.parse(text);
    } catch {
      return json({ error: 'Gemini did not return valid JSON', detail: text.slice(0, 500) }, 502);
    }
    const items = normalizeItems(lines);

    return json({ items }, 200);
  },
};
