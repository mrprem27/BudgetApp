# receipt-ocr-proxy

Thin Cloudflare Worker that proxies a receipt photo to Gemini Flash's free tier and
returns structured line items (`{name, qty, unitPrice}[]`). It exists to hold the Gemini
API key server-side — the app can never safely embed a raw API key in a shipped mobile
bundle, so this one small stateless function is the whole "backend."

This is used by the app's `gemini` receipt-scan provider
(`budgetsplit/src/lib/ocrProviders/gemini.ts`) — see that file, and
`budgetsplit/src/lib/ocrProviders/index.ts` for how it compares to the on-device provider.

## Deploy

1. `npm install -g wrangler` (if not already installed)
2. `wrangler login`
3. From this folder, set the secret (get a free key at https://aistudio.google.com/apikey):
   ```
   wrangler secret put GEMINI_API_KEY
   ```
4. `wrangler deploy`
5. Copy the deployed Worker URL (e.g. `https://receipt-ocr-proxy.<your-subdomain>.workers.dev`)
   into the app's env as `EXPO_PUBLIC_RECEIPT_OCR_PROXY_URL=<url>` (`budgetsplit/.env` or
   your EAS build environment).

## Request / response

```
POST /
{ "imageBase64": "<base64-encoded photo>", "mimeType": "image/jpeg" }

→ 200 { "items": [{ "name": "Coffee", "qty": "1", "unitPrice": "150.00" }, ...] }
→ 4xx/5xx { "error": "...", "detail"?: "..." }
```

## Notes

- Free tier: no card required, but shared across every user of the app (one Worker, one
  Gemini key) — plenty for personal/small-scale use, worth watching if the app grows a
  real user base. See the ranked comment in `ocrProviders/index.ts` for the full tradeoff
  writeup (including why Mistral's free tier isn't wired up as an alternative yet).
- `GEMINI_MODEL` in `index.ts` is a plain string constant, not an env var — Google
  periodically renames/retires Flash aliases, so bumping it is meant to be a one-line,
  git-reviewable code change rather than a silent config flip.