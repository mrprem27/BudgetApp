/**
 * Live updates (`DQ-108`): while the app is open and signed in, one WebSocket to the server's
 * `/sync/live`. The server says "changed" when a push touched data this account can read (a
 * friend's expense in a shared group, an edit from this account's other phone), and the app runs
 * its ordinary sync, so every rule stays on the one write path. Closed in the background; a
 * dropped connection comes back with growing waits. Network-injected so it can be tested.
 */

/** The part of a WebSocket this uses. */
export type LiveSocket = {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
};

export type LiveDeps = {
  /** Where to connect and as whom; null when signed out or no server is configured. */
  target(): Promise<{ url: string; token: string } | null>;
  open(url: string, token: string): LiveSocket;
  /** Something this account can read changed on the server. */
  onChanged(): void;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(t: unknown): void;
};

export const PING_MS = 30_000;
const BACKOFF_MS = [1_000, 2_000, 5_000, 15_000, 60_000];

export function createLive(deps: LiveDeps) {
  let socket: LiveSocket | null = null;
  let wanted = false;
  let connected = false;
  let attempt = 0;
  let retry: unknown = null;
  let ping: unknown = null;

  const clear = () => {
    if (retry) { deps.clearTimer(retry); retry = null; }
    if (ping) { deps.clearTimer(ping); ping = null; }
  };

  async function connect() {
    if (!wanted || socket) return;
    const t = await deps.target().catch(() => null);
    if (!t || !wanted || socket) return;
    const ws = deps.open(t.url, t.token);
    socket = ws;
    ws.onopen = () => {
      connected = true;
      attempt = 0;
      // Anything missed while the socket was down.
      deps.onChanged();
      const beat = () => { try { ws.send('ping'); } catch { /* closing */ } ping = deps.setTimer(beat, PING_MS); };
      ping = deps.setTimer(beat, PING_MS);
    };
    ws.onmessage = e => {
      if (typeof e.data === 'string' && e.data.includes('"changed"')) deps.onChanged();
    };
    ws.onerror = () => { /* onclose follows */ };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      connected = false;
      clear();
      if (!wanted) return;
      const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      attempt += 1;
      retry = deps.setTimer(() => { retry = null; void connect(); }, wait);
    };
  }

  return {
    /** Open (or keep) the connection. Safe to call on every foreground. */
    start() { wanted = true; void connect(); },
    /** Close it and stop reconnecting: the app went to the background. */
    stop() {
      wanted = false;
      clear();
      const ws = socket;
      socket = null;
      connected = false;
      attempt = 0;
      try { ws?.close(); } catch { /* already closed */ }
    },
    isConnected: () => connected,
  };
}
