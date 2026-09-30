import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../types';
import type { Hubs } from './fanout';

/**
 * One per user (`DQ-108`): holds that user's open app connections, and tells them "something
 * changed" when a push touches data they can read. The app then runs its ordinary sync, so every
 * rule stays on the one write path. Hibernating WebSockets: an idle connection costs nothing.
 */
export class UserHub extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const device = new URL(request.url).searchParams.get('device') ?? '';
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [device || 'unknown']);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  /** Nudge every open connection except the device that made the change. */
  async notify(exceptDevice: string | null): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      if (exceptDevice && this.ctx.getTags(ws).includes(exceptDevice)) continue;
      try { ws.send('{"type":"changed"}'); } catch { /* closing; it reconnects */ }
    }
  }

  /** The app pings to keep mobile networks from dropping an idle socket. */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (message === 'ping') ws.send('pong');
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try { ws.close(code, 'closing'); } catch { /* already closed */ }
  }
}

/** The hubs, as `fanout.ts` sees them. */
export function hubsOf(env: Env): Hubs | null {
  const ns = env.USER_HUB;
  if (!ns) return null;
  return { notify: (userId, except) => ns.get(ns.idFromName(userId)).notify(except) };
}
