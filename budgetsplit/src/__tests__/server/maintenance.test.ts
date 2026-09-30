import { createD1 } from './helpers/d1';
import { makeUser } from './helpers/fixtures';
import { cleanupExpired } from '../../../../server/api/maintenance';

/** The nightly cron: expired links, sessions and unclaimed invites go; live ones and claimed invites stay. */
describe('nightly cleanup', () => {
  it('removes only what has expired', async () => {
    const db = createD1();
    const u = await makeUser(db);
    const NOW = 1_750_000_000_000;
    const run = (sql: string, ...v: unknown[]) => db.prepare(sql).bind(...v).run();
    await run('INSERT INTO magic_links (token, email, expires_at) VALUES (?, ?, ?)', 'old', 'a@b.c', NOW - 1);
    await run('INSERT INTO magic_links (token, email, expires_at) VALUES (?, ?, ?)', 'new', 'a@b.c', NOW + 1);
    await run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', 's-old', u.userId, NOW - 100, NOW - 1);
    await run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', 's-new', u.userId, NOW - 100, NOW + 1);
    await run('INSERT INTO invites (token, from_user, expires_at, created_at) VALUES (?, ?, ?, ?)', 'i-old', u.userId, NOW - 1, NOW - 100);
    await run("INSERT INTO invites (token, from_user, expires_at, created_at, state) VALUES (?, ?, ?, ?, 'approved')", 'i-kept', u.userId, NOW - 1, NOW - 100);

    await cleanupExpired(db, NOW);

    const ids = async (table: string, col = 'token') =>
      ((await db.prepare(`SELECT ${col} AS id FROM ${table} ORDER BY 1`).all<{ id: string }>()).results ?? []).map(r => r.id);
    expect(await ids('magic_links')).toEqual(['new']);
    expect((await ids('sessions')).filter(t => t.startsWith('s-'))).toEqual(['s-new']);
    expect(await ids('invites')).toEqual(['i-kept']);
  });
});
