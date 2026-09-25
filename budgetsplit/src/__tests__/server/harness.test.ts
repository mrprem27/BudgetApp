import { createD1, migrationFiles } from './helpers/d1';

/**
 * The D1 stand-in has to fail the way D1 fails, or every server test built on it
 * is green for the wrong reason. Two behaviours matter most: foreign keys are
 * enforced (D1's default, unlike the app's own SQLite), and a batch is one
 * transaction — a failure anywhere in it leaves nothing behind.
 */
describe('D1 test harness', () => {
  it('loads the schema cleanly — one file, by design (development phase, no data to protect)', () => {
    const files = migrationFiles();
    expect(files).toEqual(['0001_schema.sql']);
    const db = createD1();
    const tables = db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      .map(r => (r as { name: string }).name);
    expect(tables).toEqual(expect.arrayContaining(['users', 'sessions', 'links', 'transactions']));
    // The v1 zero-knowledge tables went in S22.
    expect(tables).not.toContain('sync_entry');
  });

  it('enforces foreign keys, as D1 does by default', async () => {
    const db = createD1();
    await expect(
      db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .bind('t1', 'no-such-user', 1, 2).run(),
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it('answers prepare/bind/first/all/run in D1 shapes', async () => {
    const db = createD1();
    const ins = await db.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)')
      .bind('u1', 'a@x.in', 1).run();
    expect(ins.success).toBe(true);
    expect(ins.meta.changes).toBe(1);

    const one = await db.prepare('SELECT id, email FROM users WHERE id = ?').bind('u1').first<{ id: string }>();
    expect(one).toEqual({ id: 'u1', email: 'a@x.in' });
    expect(await db.prepare('SELECT email FROM users WHERE id = ?').bind('u1').first('email')).toBe('a@x.in');
    expect(await db.prepare('SELECT id FROM users WHERE id = ?').bind('nope').first()).toBeNull();

    const all = await db.prepare('SELECT id FROM users').all<{ id: string }>();
    expect(all.results).toEqual([{ id: 'u1' }]);
  });

  it('treats a batch as one transaction: one failure undoes the rest', async () => {
    const db = createD1();
    const insert = (id: string, email: string) =>
      db.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)').bind(id, email, 1);

    await expect(db.batch([insert('u1', 'a@x.in'), insert('u2', 'a@x.in')])).rejects.toThrow(/UNIQUE/);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM users').first('n')).toBe(0);

    const ok = await db.batch([insert('u1', 'a@x.in'), insert('u2', 'b@x.in')]);
    expect(ok.map(r => r.meta.changes)).toEqual([1, 1]);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM users').first('n')).toBe(2);
  });

  it('keeps a prepared statement reusable across binds', async () => {
    const db = createD1();
    const stmt = db.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)');
    await stmt.bind('u1', 'a@x.in', 1).run();
    await stmt.bind('u2', 'b@x.in', 1).run();
    expect(await db.prepare('SELECT COUNT(*) AS n FROM users').first('n')).toBe(2);
  });
});
