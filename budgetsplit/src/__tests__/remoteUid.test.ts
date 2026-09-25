import { setRemoteUid, personByRemoteUid, insertPerson, matchAccount } from '../db/queries/persons';
import { appliesImmediately } from '../lib/trust';
import { createTestDb, addPerson, asDb } from './helpers/testDb';

/**
 * The write that makes the whole trust model reachable.
 *
 * `remote_uid` was declared, uniquely indexed, and written by nothing — so
 * `appliesImmediately` returned false for everyone and `ingestPeerTxn` would have
 * refused every envelope as `unknown-author`. Trust was inert, correctly, because
 * nothing could arrive. This is the bridge that changes that.
 */
describe('binding a local person to an account', () => {
  it('is what turns trust from inert into real', async () => {
    const db = createTestDb();
    const id = addPerson(db, 'Rohit', false);
    await db.runAsync("UPDATE person SET trust_state = 'trusted' WHERE id = ?", [id]);

    // Trusted, but with no account there is no write path — so it means nothing.
    const before = await db.getFirstAsync<any>('SELECT * FROM person WHERE id = ?', [id]);
    expect(appliesImmediately(before)).toBe(false);

    const bound = await setRemoteUid(asDb(db), id, 'acct-rohit');
    const after = await db.getFirstAsync<any>('SELECT * FROM person WHERE id = ?', [bound]);
    expect(appliesImmediately(after)).toBe(true);
  });

  it('does not make an untrusted person trusted', async () => {
    // Binding says "this is who they are", never "and I trust them". Two
    // decisions, deliberately separate.
    const db = createTestDb();
    const id = addPerson(db, 'Aarav', false);
    const bound = await setRemoteUid(asDb(db), id, 'acct-aarav');
    const p = await db.getFirstAsync<any>('SELECT * FROM person WHERE id = ?', [bound]);
    expect(appliesImmediately(p)).toBe(false);
  });

  it('finds the person an account belongs to', async () => {
    const db = createTestDb();
    const id = addPerson(db, 'Rohit', false);
    // The person takes the account's id, so a shared group's rows about them
    // land here instead of on a second Rohit (S20).
    const bound = await setRemoteUid(asDb(db), id, 'acct-rohit');
    expect(bound).toBe('user:acct-rohit');
    expect((await personByRemoteUid(asDb(db), 'acct-rohit'))?.id).toBe(bound);
    expect(await personByRemoteUid(asDb(db), 'acct-nobody')).toBeNull();
  });

  it('can be undone, so a wrong binding is not permanent', async () => {
    // Binding the wrong person would otherwise silently grant that account the
    // ability to write entries as them, forever.
    const db = createTestDb();
    const id = addPerson(db, 'Rohit', false);
    const bound = await setRemoteUid(asDb(db), id, 'acct-rohit');
    const released = await setRemoteUid(asDb(db), bound, null);
    expect(await personByRemoteUid(asDb(db), 'acct-rohit')).toBeNull();
    // And gives the account's id back: a row still called `user:acct-rohit`
    // would catch that account's rows on the next shared-group pull.
    expect(released).not.toMatch(/^user:/);
    const row = await db.getFirstAsync<any>('SELECT name, remote_uid FROM person WHERE id = ?', [released]);
    expect(row).toEqual({ name: 'Rohit', remote_uid: null });
    expect(await db.getFirstAsync('SELECT 1 FROM person WHERE id = ?', [bound])).toBeNull();
  });

  it('never leaves one account on two people', async () => {
    // Failure F5 in a different place: "who wrote this" would have two answers.
    // Every bound person lives under the account's id, so a second bind folds
    // into the first rather than making a second holder.
    const db = createTestDb();
    const a = addPerson(db, 'Rohit', false);
    const b = addPerson(db, 'Rohit (work)', false);
    await setRemoteUid(asDb(db), a, 'acct-rohit');
    await setRemoteUid(asDb(db), b, 'acct-rohit');
    const holders = await db.getAllAsync<any>("SELECT id FROM person WHERE remote_uid = 'acct-rohit'");
    expect(holders.map((h: any) => h.id)).toEqual(['user:acct-rohit']);
  });

  describe('matching on Linked people', () => {
    function scene() {
      const db = createTestDb();
      const me = addPerson(db, 'Me', true);
      const wrong = addPerson(db, 'Rohit', false);
      const right = addPerson(db, 'Aarav', false);
      return { db, me, wrong, right };
    }
    const names = (db: ReturnType<typeof createTestDb>) =>
      db.getAllAsync<any>('SELECT name, remote_uid FROM person WHERE is_me = 0 ORDER BY name');

    it('moves a guess to the right person, and the wrong one keeps being themselves', async () => {
      const { db, wrong, right } = scene();
      await matchAccount(asDb(db), 'acct-aarav', wrong);
      await matchAccount(asDb(db), 'acct-aarav', right);
      expect(await names(db)).toEqual([
        { name: 'Aarav', remote_uid: 'acct-aarav' },
        { name: 'Rohit', remote_uid: null },
      ]);
    });

    it('folds into the account when it already shares a group with me — it IS them', async () => {
      const { db, me, wrong, right } = scene();
      const bound = await setRemoteUid(asDb(db), wrong, 'acct-aarav');
      db.raw.prepare("INSERT INTO budget_group (id, name, icon, color, created_at) VALUES ('flat', 'Flat', 'home', '#20C4B8', 1)").run();
      for (const p of [me, bound]) db.raw.prepare('INSERT INTO group_member (group_id, person_id, joined_at) VALUES (?, ?, 1)').run('flat', p);
      await matchAccount(asDb(db), 'acct-aarav', right);
      // One person, my name for them, still in the group.
      expect(await names(db)).toEqual([{ name: 'Aarav', remote_uid: 'acct-aarav' }]);
      expect(db.raw.prepare("SELECT person_id FROM group_member WHERE group_id = 'flat' AND person_id <> ?").get(me))
        .toEqual({ person_id: 'user:acct-aarav' });
    });

    it('refuses to unmatch an account that shares a group with me', async () => {
      const { db, me, wrong } = scene();
      const bound = await setRemoteUid(asDb(db), wrong, 'acct-aarav');
      db.raw.prepare("INSERT INTO budget_group (id, name, icon, color, created_at) VALUES ('flat', 'Flat', 'home', '#20C4B8', 1)").run();
      for (const p of [me, bound]) db.raw.prepare('INSERT INTO group_member (group_id, person_id, joined_at) VALUES (?, ?, 1)').run('flat', p);
      await expect(matchAccount(asDb(db), 'acct-aarav', null)).rejects.toThrow(/Flat/);
      expect(await personByRemoteUid(asDb(db), 'acct-aarav')).not.toBeNull();
    });
  });

  it('leaves unbound people alone — many nulls are fine', async () => {
    // The index is partial for exactly this reason: almost every person has no
    // account, and a plain unique index would allow only one of them.
    const db = createTestDb();
    addPerson(db, 'A', false);
    addPerson(db, 'B', false);
    const n = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM person WHERE remote_uid IS NULL');
    expect(n!.c).toBeGreaterThanOrEqual(2);
  });
});
