import { setRemoteUid, personByRemoteUid, insertPerson } from '../db/queries/persons';
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

    await setRemoteUid(asDb(db), id, 'acct-rohit');
    const after = await db.getFirstAsync<any>('SELECT * FROM person WHERE id = ?', [id]);
    expect(appliesImmediately(after)).toBe(true);
  });

  it('does not make an untrusted person trusted', async () => {
    // Binding says "this is who they are", never "and I trust them". Two
    // decisions, deliberately separate.
    const db = createTestDb();
    const id = addPerson(db, 'Aarav', false);
    await setRemoteUid(asDb(db), id, 'acct-aarav');
    const p = await db.getFirstAsync<any>('SELECT * FROM person WHERE id = ?', [id]);
    expect(appliesImmediately(p)).toBe(false);
  });

  it('finds the person an account belongs to', async () => {
    const db = createTestDb();
    const id = addPerson(db, 'Rohit', false);
    await setRemoteUid(asDb(db), id, 'acct-rohit');
    expect((await personByRemoteUid(asDb(db), 'acct-rohit'))?.id).toBe(id);
    expect(await personByRemoteUid(asDb(db), 'acct-nobody')).toBeNull();
  });

  it('can be undone, so a wrong binding is not permanent', async () => {
    // Binding the wrong person would otherwise silently grant that account the
    // ability to write entries as them, forever.
    const db = createTestDb();
    const id = addPerson(db, 'Rohit', false);
    await setRemoteUid(asDb(db), id, 'acct-rohit');
    await setRemoteUid(asDb(db), id, null);
    expect(await personByRemoteUid(asDb(db), 'acct-rohit')).toBeNull();
  });

  it('refuses to bind one account to two people', async () => {
    // The partial unique index. Two "me" rows for one account is failure F5 in a
    // different place: "who wrote this" would have two answers.
    const db = createTestDb();
    const a = addPerson(db, 'Rohit', false);
    const b = addPerson(db, 'Rohit (work)', false);
    await setRemoteUid(asDb(db), a, 'acct-rohit');
    await expect(setRemoteUid(asDb(db), b, 'acct-rohit')).rejects.toThrow();
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
