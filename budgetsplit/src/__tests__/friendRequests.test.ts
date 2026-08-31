import {
  recordSentRequest, applyRequestOutcome, pendingInvitesByPerson, requestForPerson,
} from '../db/queries/friendRequests';
import { createTestDb, addPerson, asDb, type TestDb } from './helpers/testDb';

/**
 * The local half of a friend request, and why it exists at all.
 *
 * The server owns the request's state. This table owns the one thing the server
 * cannot be told without becoming a directory: **which local person I meant when
 * I typed that address.** Without it, accepting a request leaves the account
 * unbound to any row — and an unbound person is inert, because
 * `appliesImmediately` returns false whenever `remote_uid` is null. The whole
 * point of connecting would silently not have happened.
 *
 * Binding here is safe in a way it is NOT on the QR path. An invite link is made
 * to be forwarded, so `setRemoteUid` there is a deliberate manual step. An email
 * request is the opposite: I typed the address AND chose the row, and the server
 * proved somebody holding that inbox accepted.
 */

const uid = (db: TestDb, personId: string) =>
  (db.raw.prepare('SELECT remote_uid FROM person WHERE id = ?').get(personId) as { remote_uid: string | null }).remote_uid;

function scene() {
  const db = createTestDb();
  addPerson(db, 'Me', true);
  const aarav = addPerson(db, 'Aarav');
  return { db, aarav };
}

describe('an accepted request binds the person I chose', () => {
  it('writes the account id onto that row, with no further step', async () => {
    const s = scene();
    await recordSentRequest(asDb(s.db), { id: 'req-1', email: 'aarav@example.com', personId: s.aarav });

    await applyRequestOutcome(asDb(s.db), {
      id: 'req-1', state: 'accepted', email: 'aarav@example.com', accountId: 'acct-aarav',
    });

    expect(uid(s.db, s.aarav)).toBe('acct-aarav');
    expect((await requestForPerson(asDb(s.db), s.aarav))?.state).toBe('accepted');
  });

  it('binds nothing when the address is not the one I sent to', async () => {
    /*
     * The guard that matters most. Binding the wrong account to a person means
     * every entry that account ever authors lands on the wrong ledger row — and
     * nothing downstream would ever catch it, because from then on it resolves
     * perfectly well to the wrong person.
     */
    const s = scene();
    await recordSentRequest(asDb(s.db), { id: 'req-1', email: 'aarav@example.com', personId: s.aarav });

    await applyRequestOutcome(asDb(s.db), {
      id: 'req-1', state: 'accepted', email: 'someone.else@example.com', accountId: 'acct-stranger',
    });

    expect(uid(s.db, s.aarav)).toBeNull();
  });

  it('ignores case and spacing on the address, which a user will not be careful about', async () => {
    const s = scene();
    await recordSentRequest(asDb(s.db), { id: 'req-1', email: 'aarav@example.com', personId: s.aarav });

    await applyRequestOutcome(asDb(s.db), {
      id: 'req-1', state: 'accepted', email: '  Aarav@Example.com ', accountId: 'acct-aarav',
    });

    expect(uid(s.db, s.aarav)).toBe('acct-aarav');
  });

  it('binds nothing on a decline', async () => {
    const s = scene();
    await recordSentRequest(asDb(s.db), { id: 'req-1', email: 'aarav@example.com', personId: s.aarav });

    await applyRequestOutcome(asDb(s.db), {
      id: 'req-1', state: 'declined', email: 'aarav@example.com', accountId: 'acct-aarav',
    });

    expect(uid(s.db, s.aarav)).toBeNull();
    expect((await requestForPerson(asDb(s.db), s.aarav))?.state).toBe('declined');
  });

  it('binds nothing when the request was sent from the inbox, with no person in mind', async () => {
    const s = scene();
    await recordSentRequest(asDb(s.db), { id: 'req-1', email: 'nobody@example.com', personId: null });

    await applyRequestOutcome(asDb(s.db), {
      id: 'req-1', state: 'accepted', email: 'nobody@example.com', accountId: 'acct-x',
    });

    expect(uid(s.db, s.aarav)).toBeNull();
  });
});

describe('what the People screen can say', () => {
  it('reports a waiting invite against its person', async () => {
    const s = scene();
    await recordSentRequest(asDb(s.db), { id: 'req-1', email: 'aarav@example.com', personId: s.aarav });
    expect((await pendingInvitesByPerson(asDb(s.db))).get(s.aarav)).toBe('aarav@example.com');
  });

  it('stops reporting it once it is answered', async () => {
    const s = scene();
    await recordSentRequest(asDb(s.db), { id: 'req-1', email: 'aarav@example.com', personId: s.aarav });
    await applyRequestOutcome(asDb(s.db), {
      id: 'req-1', state: 'accepted', email: 'aarav@example.com', accountId: 'acct-aarav',
    });
    expect((await pendingInvitesByPerson(asDb(s.db))).has(s.aarav)).toBe(false);
  });

  it('re-sending to the same person keeps one row', async () => {
    const s = scene();
    await recordSentRequest(asDb(s.db), { id: 'req-1', email: 'aarav@example.com', personId: s.aarav });
    await recordSentRequest(asDb(s.db), { id: 'req-1', email: 'aarav@example.com', personId: s.aarav });
    expect(s.db.raw.prepare('SELECT COUNT(*) AS c FROM friend_request').get()).toEqual({ c: 1 });
  });
});
