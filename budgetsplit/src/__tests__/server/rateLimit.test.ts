import { createD1 } from './helpers/d1';
import { magicLinkAllowed, recordMagicLink, callerIp } from '../../../../server/api/rateLimit';
import { MAGIC_LINK_MAX_PER_WINDOW, MAGIC_LINK_MAX_PER_IP } from '../../../../server/api/lib';

/**
 * Sign-in links are limited per address AND per caller (SV-1). Per address alone
 * let one client ask for links to any number of different inboxes.
 */
const NOW = 1_800_000_000_000;

async function ask(db: ReturnType<typeof createD1>, email: string, ip: string | null, n = 1) {
  for (let i = 0; i < n; i++) await recordMagicLink(db as never, `t-${Math.random()}`, email, ip, NOW).run();
}

describe('magicLinkAllowed', () => {
  it('lets a first request through', async () => {
    expect(await magicLinkAllowed(createD1() as never, 'a@x.com', '1.1.1.1', NOW)).toBe('ok');
  });

  it('stops one address at its own limit', async () => {
    const db = createD1();
    await ask(db, 'a@x.com', '1.1.1.1', MAGIC_LINK_MAX_PER_WINDOW);
    expect(await magicLinkAllowed(db as never, 'a@x.com', '2.2.2.2', NOW)).toBe('email');
  });

  it('stops one caller asking for many different addresses', async () => {
    const db = createD1();
    for (let i = 0; i < MAGIC_LINK_MAX_PER_IP; i++) await ask(db, `victim${i}@x.com`, '9.9.9.9');
    expect(await magicLinkAllowed(db as never, 'fresh@x.com', '9.9.9.9', NOW)).toBe('caller');
    // ...and only that caller.
    expect(await magicLinkAllowed(db as never, 'fresh@x.com', '8.8.8.8', NOW)).toBe('ok');
  });

  it('does not count expired requests', async () => {
    const db = createD1();
    await ask(db, 'a@x.com', '1.1.1.1', MAGIC_LINK_MAX_PER_WINDOW);
    expect(await magicLinkAllowed(db as never, 'a@x.com', '1.1.1.1', NOW + 16 * 60 * 1000)).toBe('ok');
  });

  it('has no per-caller limit when the caller is unknown (local dev)', async () => {
    const db = createD1();
    for (let i = 0; i < MAGIC_LINK_MAX_PER_IP + 5; i++) await ask(db, `p${i}@x.com`, null);
    expect(await magicLinkAllowed(db as never, 'fresh@x.com', null, NOW)).toBe('ok');
  });
});

it('reads the caller from Cloudflare\'s header', () => {
  expect(callerIp(new Request('https://x', { headers: { 'cf-connecting-ip': ' 5.6.7.8 ' } }))).toBe('5.6.7.8');
  expect(callerIp(new Request('https://x'))).toBeNull();
});
