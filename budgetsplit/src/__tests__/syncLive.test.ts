import { createLive, PING_MS, type LiveSocket } from '../lib/sync/live';

/** `DQ-108`: the live connection opens, nudges sync, pings, reconnects, and stops in the background. */
function harness(target: { url: string; token: string } | null = { url: 'wss://x/sync/live?device=d1', token: 't' }) {
  const sockets: Array<LiveSocket & { sent: string[]; closed: boolean }> = [];
  const timers: Array<{ fn: () => void; ms: number; live: boolean }> = [];
  let changed = 0;
  const live = createLive({
    target: async () => target,
    open: () => {
      const s = { sent: [] as string[], closed: false, onopen: null, onmessage: null, onclose: null, onerror: null,
        send(d: string) { s.sent.push(d); }, close() { s.closed = true; } } as LiveSocket & { sent: string[]; closed: boolean };
      sockets.push(s);
      return s;
    },
    onChanged: () => { changed += 1; },
    setTimer: (fn, ms) => { const t = { fn, ms, live: true }; timers.push(t); return t; },
    clearTimer: t => { (t as { live: boolean }).live = false; },
  });
  const fire = (ms: number) => timers.filter(t => t.live && t.ms === ms).forEach(t => { t.live = false; t.fn(); });
  return { live, sockets, timers, fire, changed: () => changed };
}
const tick = () => new Promise(r => setImmediate(r));

describe('the live connection', () => {
  it('syncs on connect (to catch up) and on every "changed"', async () => {
    const h = harness();
    h.live.start();
    await tick();
    h.sockets[0].onopen!();
    expect(h.changed()).toBe(1);
    h.sockets[0].onmessage!({ data: '{"type":"changed"}' });
    h.sockets[0].onmessage!({ data: 'pong' });
    expect(h.changed()).toBe(2);
    expect(h.live.isConnected()).toBe(true);
  });

  it('pings to keep the socket alive', async () => {
    const h = harness();
    h.live.start();
    await tick();
    h.sockets[0].onopen!();
    h.fire(PING_MS);
    expect(h.sockets[0].sent).toEqual(['ping']);
  });

  it('reconnects after a drop, waiting longer each time', async () => {
    const h = harness();
    h.live.start();
    await tick();
    h.sockets[0].onclose!();
    expect(h.timers.filter(t => t.live).map(t => t.ms)).toEqual([1000]);
    h.fire(1000);
    await tick();
    expect(h.sockets).toHaveLength(2);
    h.sockets[1].onclose!();
    expect(h.timers.filter(t => t.live).map(t => t.ms)).toEqual([2000]);
  });

  it('stops for good in the background, and does nothing signed out', async () => {
    const h = harness();
    h.live.start();
    await tick();
    h.live.stop();
    expect(h.sockets[0].closed).toBe(true);
    h.sockets[0].onclose?.();
    expect(h.timers.filter(t => t.live)).toEqual([]);
    expect(h.live.isConnected()).toBe(false);

    const out = harness(null);
    out.live.start();
    await tick();
    expect(out.sockets).toHaveLength(0);
  });

  it('opens one socket however many times the app comes to the front', async () => {
    const h = harness();
    h.live.start(); h.live.start();
    await tick();
    h.live.start();
    await tick();
    expect(h.sockets).toHaveLength(1);
  });
});
