import worker from '../../../../server/api/index';
import { createD1, type TestD1 } from './helpers/d1';
import { makeUser, insert } from './helpers/fixtures';

/**
 * The Worker's own routes — invites, claims, links — driven through its real
 * `fetch` on the D1 harness. Until now only `sync/` had tests; this file is the
 * first to reach `index.ts`, which is where sign-in and linking live.
 */
const ORIGIN = 'https://api.test';

function env(db: TestD1) {
  return { DB: db, EMAIL_FROM: 'a@b.co', APP_AUTH_URL: 'app:///auth', APP_LINK_URL: 'app:///link' } as never;
}

async function signedIn(db: TestD1, id: string) {
  const { userId } = await makeUser(db, id);
  const token = `session-${id}`;
  await insert(db, 'sessions', { token, user_id: userId, created_at: 1, expires_at: Date.now() + 86_400_000 });
  return { userId, token };
}

async function call(db: TestD1, token: string, method: string, path: string, body?: unknown) {
  const res = await worker.fetch(new Request(`${ORIGIN}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env(db));
  return { status: res.status, body: await res.json() as Record<string, any> };
}

/** A invites B, B taps it, A approves. Returns the link id. */
async function linkThem(db: TestD1, a: { token: string }, b: { token: string }) {
  const invite = await call(db, a.token, 'POST', '/invites');
  await call(db, b.token, 'POST', '/invites/claim', { token: invite.body.token });
  const approved = await call(db, a.token, 'POST', `/invites/${invite.body.token}/approve`);
  expect(approved.body.state).toBe('approved');
  const links = await call(db, a.token, 'GET', '/links');
  return links.body.links[0].id as string;
}

describe('re-linking after an unlink', () => {
  it('lets a fresh invite reconnect a pair that was unlinked', async () => {
    const db = createD1();
    const a = await signedIn(db, 'alice');
    const b = await signedIn(db, 'bob');
    const linkId = await linkThem(db, a, b);

    expect((await call(db, a.token, 'DELETE', `/links/${linkId}`)).status).toBe(200);
    expect((await call(db, b.token, 'GET', '/links')).body.links).toEqual([]);

    // The old code answered 'already-linked' here, for a link the list had just
    // shown as gone — so the pair could never be reconnected.
    const invite = await call(db, a.token, 'POST', '/invites');
    const claim = await call(db, b.token, 'POST', '/invites/claim', { token: invite.body.token });
    expect(claim.body.state).toBe('pending');

    await call(db, a.token, 'POST', `/invites/${invite.body.token}/approve`);
    expect((await call(db, b.token, 'GET', '/links')).body.links).toHaveLength(1);
  });

  it('still says already-linked for a live link', async () => {
    const db = createD1();
    const a = await signedIn(db, 'alice');
    const b = await signedIn(db, 'bob');
    await linkThem(db, a, b);
    const invite = await call(db, a.token, 'POST', '/invites');
    expect((await call(db, b.token, 'POST', '/invites/claim', { token: invite.body.token })).body.state).toBe('already-linked');
  });
});

describe('a claim from an account that has since been closed', () => {
  async function pendingClaimFromBob() {
    const db = createD1();
    const a = await signedIn(db, 'alice');
    const b = await signedIn(db, 'bob');
    const invite = await call(db, a.token, 'POST', '/invites');
    await call(db, b.token, 'POST', '/invites/claim', { token: invite.body.token });
    expect((await call(db, a.token, 'GET', '/invites')).body.claims).toHaveLength(1);
    expect((await call(db, b.token, 'DELETE', '/me')).status).toBe(200);
    return { db, a, inviteToken: invite.body.token as string };
  }

  it('is not listed, so the scrubbed placeholder address never reaches a screen', async () => {
    const { db, a } = await pendingClaimFromBob();
    const claims = (await call(db, a.token, 'GET', '/invites')).body.claims;
    expect(JSON.stringify(claims)).not.toContain('account.invalid');
    expect(claims).toEqual([]);
  });

  it('cannot be approved into a link with nobody', async () => {
    const { db, a, inviteToken } = await pendingClaimFromBob();
    expect((await call(db, a.token, 'POST', `/invites/${inviteToken}/approve`)).status).toBe(404);
    expect((await call(db, a.token, 'GET', '/links')).body.links).toEqual([]);
  });
});
