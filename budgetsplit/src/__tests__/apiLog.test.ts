import { recordApi, apiLog, clearApiLog, apiLogText, apiFailed, apiStatusLabel } from '../lib/apiLog';

/**
 * The dev screen's API log (`U-102`): what a call came back with, so "why did the scan fail" has
 * an answer on the phone. It keeps the response's error, and never what was sent.
 */
beforeEach(() => clearApiLog());

describe('the API log', () => {
  it('lists calls newest first, with the status and the error text of a failure', () => {
    recordApi({ service: 'server', what: 'POST /sync/push', status: 200, ms: 120, at: 1 });
    recordApi({ service: 'scan', what: 'Read receipt', status: 502, ms: 900, detail: '{"error":"Gemini request failed (429)","detail":"quota"}', at: 2 });
    const [latest, first] = apiLog();
    expect(latest).toMatchObject({ service: 'scan', status: 502 });
    expect(latest.detail).toContain('429');
    expect(first.detail).toBeUndefined();
    expect(apiFailed(latest)).toBe(true);
    expect(apiFailed(first)).toBe(false);
  });

  it('a call with no response is a failure, and says so', () => {
    recordApi({ service: 'scan', what: 'Read receipt', status: 0, ms: 60000, detail: 'Cloud scan took too long.' });
    expect(apiFailed(apiLog()[0])).toBe(true);
    expect(apiStatusLabel(apiLog()[0])).toBe('No response');
  });

  it('never keeps a query string, and caps how much of an error it holds', () => {
    recordApi({ service: 'server', what: 'GET /auth/open?token=abcdef', status: 400, ms: 5, detail: 'x'.repeat(5000) });
    const e = apiLog()[0];
    expect(e.what).toBe('GET /auth/open');
    expect(e.detail!.length).toBe(800);
  });

  it('holds the last fifty calls', () => {
    for (let i = 0; i < 60; i++) recordApi({ service: 'server', what: `GET /n${i}`, status: 200, ms: 1 });
    expect(apiLog()).toHaveLength(50);
    expect(apiLog()[0].what).toBe('GET /n59');
  });

  it('reads as text for sharing', () => {
    expect(apiLogText()).toBe('No calls recorded since the app opened.');
    recordApi({ service: 'scan', what: 'Read receipt', status: 502, ms: 900, detail: 'Gemini request failed (429)', at: Date.UTC(2026, 9, 1, 10) });
    expect(apiLogText()).toBe('2026-10-01T10:00:00.000Z  Receipt scan  Read receipt  502  900 ms\n    Gemini request failed (429)');
  });

  it('both callers record, and neither records what it sent', () => {
    const fs = jest.requireActual('fs') as typeof import('fs');
    for (const f of ['src/lib/serverApi.ts', 'src/lib/ocrProviders/gemini.ts']) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src).toMatch(/recordApi\(\{/);
      expect(src).not.toMatch(/recordApi\(\{[^}]*(imageBase64|token|body|json)\b/);
    }
  });
});
