import { claimMyAccount } from '../db/queries/persons';
import { ingestPeerTxn } from '../db/queries/peerIngest';
import { adoptGroup, dirtyRosters } from '../db/queries/syncDoc';
import { createTestDb, addPerson, addGroup, addMember, addCategory, asDb, type TestDb } from './helpers/testDb';

/**
 * The one binding the whole of sync rests on, and the one nothing could write.
 *
 * `setRemoteUid` is reachable from a single screen, Linked people, and that screen
 * filters out `is_me` — correctly, since you must never bind someone ELSE's
 * account to your own row. But there was no other path, so this device's own
 * `remote_uid` stayed NULL forever, and everything followed from that:
 *
 *   my entries went out with `author: {uid: null}` and every receiver refused them;
 *   an arriving roster naming me by account id resolved to nobody, so `adoptGroup`
 *   created a SECOND person row carrying my own uid and put that in the group;
 *   `ingestPeerTxn` then answered `not-a-member`, which the pull treats as
 *   RECOVERABLE — so the cursor held and the group stopped syncing, silently, on
 *   every launch, forever.
 *
 * And because `idx_person_remote_uid` is unique over non-null values, the phantom
 * owned my uid, so no later fix could simply set it on the right row.
 *
 * The existing suite could not catch any of this: `groupAdoption.test.ts` hand-writes
 * a `remote_uid` onto `is_me`, a state production code had no way to reach.
 */

const MY_UID = 'acct-me';
const THEIR_UID = 'acct-aarav';

/** Me and Aarav in a shared flat. Aarav is linked; I am not — the state before sign-in. */
function scene() {
  const db = createTestDb();
  const me = addPerson(db, 'Prem', true);
  const aarav = addPerson(db, 'Aarav');
  db.raw.prepare('UPDATE person SET remote_uid = ? WHERE id = ?').run(THEIR_UID, aarav);
  const flat = addGroup(db, 'Flat');
  addMember(db, flat, me);
  addMember(db, flat, aarav);
  addCategory(db, 'Food');
  return { db, me, aarav, flat };
}

/** The roster Aarav's phone publishes: he names me by account id, under HIS local id for me. */
const rosterNamingMe = (theirPidForMe: string, theirPidForThem: string) => ({
  name: 'Flat',
  icon: 'home',
  color: '#20C4B8',
  members: [
    { pid: theirPidForMe, uid: MY_UID, name: 'Prem', color: '#4F46E5' },
    { pid: theirPidForThem, uid: THEIR_UID, name: 'Aarav', color: '#20C4B8' },
  ],
});

describe('claimMyAccount', () => {
  it('binds the account and the verified email to the is_me row', async () => {
    const s = scene();
    const r = await claimMyAccount(asDb(s.db), { uid: MY_UID, email: 'me@example.com' });

    expect(r).toEqual({ ok: true, changed: true });
    expect(s.db.raw.prepare('SELECT remote_uid, email FROM person WHERE id = ?').get(s.me))
      .toEqual({ remote_uid: MY_UID, email: 'me@example.com' });
  });

  it('is idempotent — a second sync changes nothing and dirties no roster', async () => {
    const s = scene();
    await claimMyAccount(asDb(s.db), { uid: MY_UID, email: 'me@example.com' });
    await s.db.runAsync("DELETE FROM settings WHERE key LIKE 'sync.roster.dirty.%'");

    const again = await claimMyAccount(asDb(s.db), { uid: MY_UID, email: 'me@example.com' });
    expect(again).toEqual({ ok: true, changed: false });
    expect(await dirtyRosters(asDb(s.db))).toEqual([]);
  });

  it('republishes every shared roster, because my uid just became knowable', async () => {
    const s = scene();
    await claimMyAccount(asDb(s.db), { uid: MY_UID, email: null });
    expect(await dirtyRosters(asDb(s.db))).toEqual([s.flat]);
  });

  it('refuses to rebind a phone that already holds another account', async () => {
    const s = scene();
    await claimMyAccount(asDb(s.db), { uid: MY_UID, email: null });

    const r = await claimMyAccount(asDb(s.db), { uid: 'acct-someone-else', email: null });
    expect(r).toEqual({ ok: false, reason: 'other-account' });
    // Nothing moved. Rebinding would re-author every historical entry to a stranger.
    expect(s.db.raw.prepare('SELECT remote_uid FROM person WHERE id = ?').get(s.me))
      .toEqual({ remote_uid: MY_UID });
  });

  it('refuses rather than guesses when two rows claim to be me', async () => {
    const s = scene();
    addPerson(s.db, 'Prem again', true);
    expect(await claimMyAccount(asDb(s.db), { uid: MY_UID, email: null }))
      .toEqual({ ok: false, reason: 'ambiguous-me' });
  });
});

describe('the phantom "me" a roster creates before sign-in', () => {
  const FLAT = 'flat-from-roster';

  /**
   * The invitee's device, faithfully: the group does not exist here at all until
   * the roster arrives and creates it, along with its members. Aarav is already a
   * local person because he was matched on Linked people; I am not resolvable,
   * because nothing has ever written my own `remote_uid`.
   */
  function invitee() {
    const db = createTestDb();
    const me = addPerson(db, 'Prem', true);
    const aarav = addPerson(db, 'Aarav');
    db.raw.prepare('UPDATE person SET remote_uid = ? WHERE id = ?').run(THEIR_UID, aarav);
    addCategory(db, 'Food');
    return { db, me, aarav, flat: FLAT };
  }

  const adoptBeforeSignIn = (s: { db: TestDb }) =>
    adoptGroup(asDb(s.db), FLAT, rosterNamingMe('their-pid-for-me', 'their-pid-for-aarav'));

  it('is created, holds my uid, and leaves my real row out of the group', async () => {
    const s = invitee();
    await adoptBeforeSignIn(s);

    // Two rows are now "me": my real one, and the one the roster minted.
    expect(s.db.raw.prepare('SELECT id, is_me FROM person WHERE remote_uid = ?').get(MY_UID))
      .toEqual({ id: 'their-pid-for-me', is_me: 0 });
    // And the phantom, not my real row, is what became a member.
    expect(s.db.raw.prepare('SELECT COUNT(*) AS c FROM group_member WHERE group_id = ? AND person_id = ?')
      .get(FLAT, s.me)).toEqual({ c: 0 });
    expect(s.db.raw.prepare('SELECT COUNT(*) AS c FROM group_member WHERE group_id = ? AND person_id = ?')
      .get(FLAT, 'their-pid-for-me')).toEqual({ c: 1 });
  });

  it('is folded into the real me on sign-in, and every reference comes with it', async () => {
    const s = invitee();
    await adoptBeforeSignIn(s);

    const r = await claimMyAccount(asDb(s.db), { uid: MY_UID, email: 'me@example.com' });
    expect(r).toEqual({ ok: true, changed: true });

    // One row holds the uid, and it is the real me.
    const holders = s.db.raw.prepare('SELECT id, is_me FROM person WHERE remote_uid = ?').all(MY_UID);
    expect(holders).toEqual([{ id: s.me, is_me: 1 }]);
    expect(s.db.raw.prepare('SELECT COUNT(*) AS c FROM person WHERE id = ?').get('their-pid-for-me'))
      .toEqual({ c: 0 });
    expect(s.db.raw.prepare('SELECT COUNT(*) AS c FROM group_member WHERE person_id = ?').get('their-pid-for-me'))
      .toEqual({ c: 0 });
  });

  /**
   * The assertion this whole phase exists for: after signing in, an entry from
   * Aarav that names me is ACCEPTED rather than refused as `not-a-member` — the
   * refusal that held the cursor and killed the group.
   */
  it('lets a peer entry naming me land, where before it was refused forever', async () => {
    const s = invitee();
    await adoptBeforeSignIn(s);

    const envelope = {
      authorUid: THEIR_UID,
      groupId: s.flat,
      version: 1,
      kind: 'expense' as const,
      date: Date.now(),
      category: 'Food',
      payments: [{ personId: s.aarav, amount: 100000 }],
      shares: [{ personId: s.me, amount: 50000 }, { personId: s.aarav, amount: 50000 }],
    };

    // Before: my real row is not what the roster put in the group.
    expect(await ingestPeerTxn(asDb(s.db), envelope))
      .toEqual({ ok: false, reason: 'not-a-member' });

    await claimMyAccount(asDb(s.db), { uid: MY_UID, email: null });

    expect(await ingestPeerTxn(asDb(s.db), { ...envelope, entryId: 'e1' }))
      .toMatchObject({ ok: true });
  });

  it('resolves me from the roster once bound, creating no phantom at all', async () => {
    const s = invitee();
    await claimMyAccount(asDb(s.db), { uid: MY_UID, email: null });

    await adoptBeforeSignIn(s);

    // And my REAL row is the one that joined the group.
    expect(s.db.raw.prepare('SELECT COUNT(*) AS c FROM group_member WHERE group_id = ? AND person_id = ?')
      .get(FLAT, s.me)).toEqual({ c: 1 });

    // Rule 1 hits: a local person carrying that uid IS them. Nothing minted.
    expect(s.db.raw.prepare('SELECT COUNT(*) AS c FROM person WHERE id = ?').get('their-pid-for-me'))
      .toEqual({ c: 0 });
    expect(s.db.raw.prepare('SELECT COUNT(*) AS c FROM person WHERE remote_uid = ?').get(MY_UID))
      .toEqual({ c: 1 });
  });
});
