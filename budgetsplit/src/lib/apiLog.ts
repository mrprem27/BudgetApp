/**
 * What the app's network calls came back with, for the dev screen (`U-102`): the receipt scan
 * (our proxy in front of Google's Gemini) and the account server. When a scan quietly falls back
 * to the phone, or sync refuses something, this says which call failed, with what status, and
 * the error text the server sent, so "why did it fail" has an answer on the phone itself.
 *
 * In memory only, the last 50 calls, gone when the app closes. It never holds what was SENT (a
 * receipt photo, your entries, a token): only the route, the status, how long it took, and on a
 * failure the response's error text.
 */
export type ApiService = 'scan' | 'server';
export type ApiLogEntry = {
  at: number;
  service: ApiService;
  /** What was called, without any query string: "POST /sync/push", "Read receipt". */
  what: string;
  /** HTTP status; 0 when no response came back (no network, timed out). */
  status: number;
  ms: number;
  /** The error the server sent, or why there was no response. Absent on success. */
  detail?: string;
};

const KEEP = 50;
const DETAIL_MAX = 800;
const recent: ApiLogEntry[] = [];

export function recordApi(e: Omit<ApiLogEntry, 'at'> & { at?: number }): void {
  recent.push({
    ...e,
    at: e.at ?? Date.now(),
    what: e.what.split('?')[0],
    detail: e.detail ? e.detail.slice(0, DETAIL_MAX) : undefined,
  });
  if (recent.length > KEEP) recent.shift();
}

export const apiFailed = (e: Pick<ApiLogEntry, 'status'>): boolean => e.status === 0 || e.status >= 400;

/** Newest first. */
export function apiLog(): ApiLogEntry[] {
  return [...recent].reverse();
}

export function clearApiLog(): void { recent.length = 0; }

const SERVICE_LABEL: Record<ApiService, string> = { scan: 'Receipt scan', server: 'Account server' };
export const apiServiceLabel = (s: ApiService): string => SERVICE_LABEL[s];

/** "502" or "No response", for a row. */
export const apiStatusLabel = (e: Pick<ApiLogEntry, 'status'>): string => (e.status === 0 ? 'No response' : String(e.status));

/** The whole log as text, oldest call last, to paste into a message. */
export function apiLogText(entries: ApiLogEntry[] = apiLog()): string {
  if (entries.length === 0) return 'No calls recorded since the app opened.';
  return entries.map(e => {
    const time = new Date(e.at).toISOString();
    return `${time}  ${SERVICE_LABEL[e.service]}  ${e.what}  ${apiStatusLabel(e)}  ${e.ms} ms${e.detail ? `\n    ${e.detail}` : ''}`;
  }).join('\n');
}
