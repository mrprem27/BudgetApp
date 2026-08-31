import { adoptGroup, readRosterDoc, type RosterDoc } from '../db/queries/syncDoc';
import { isAdmin, canAddMember, canDeleteGroup } from '../lib/permissions';
import { getGroupContext } from '../db/queries/groups';
import { createTestDb, addPerson, addGroup, addMember, asDb, type TestDb } from './helpers/testDb';

/**
 * The roster is republished on every change, and the receiver used to ignore all
 * of it.
 *
 * `adoptGroup` was `INSERT OR IGNORE` throughout, which made the whole living-
 * document design deliver only the FIRST roster. `updateGroup`, `updatePersonName`,
 * `addMemberToGroup` and `removeMemberFromGroup` each marked the roster dirty and
 * `drainRosters` each sent a new version — and every one of them was discarded on
 * arrival. A rename never appeared, a recolour never landed, group settings that
 * decide what the settle-up instructions look like stayed on one phone, and a
 * removed member remained a member forever on everyone else's device, with
 * `ingestPeerTxn` still accepting entries that named them.
 *
 * Separately, an adopted group arrived with no creator and every member at
 * `'member'`, so `isAdmin` was false for EVERYBODY: no budget edits, no adding or
 * removing members, no role changes, no deleting. Permanently — the one-time fix
 * that repairs exactly that state is marked applied on first launch and never
 * revisits.
 */

const MY_UID = 'acct-me';
const THEIR_UID = 'acct-aarav';
const PRIYA_UID = 'acct-priya';
const FLAT = 'flat-1';

/** The invitee's device: people it knows by account, and no group yet. */
function invitee() {
  const db = createTestDb();
  const me = addPerson(db, 'Prem', true);
  db.raw.prepare('UPDATE person SET remote_uid = ? WHERE id = ?').run(MY_UID, me);
  const aarav = addPerson(db, 'Aarav');
  db.raw.prepare('UPDATE person SET remote_uid = ? WHERE id = ?').run(THEIR_UID, aarav);
  return { db, me, aarav };
}

/** What Aarav's phone publishes. He is the creator and an admin. */
function roster(over: Partial<RosterDoc> = {}, members?: RosterDoc['members']): RosterDoc {
  return {
    name: 'Flat',
    icon: 'home',
    color: '#20C4B8',
    createdBy: THEIR_UID,
    simplifyDebt: 1,
    defaultSplit: 'equal',
    members: members ?? [
      { pid: 'their-me', uid: MY_UID, name: 'Prem', color: '#4F46E5', role: 'member' },
      { pid: 'their-aarav', uid: THEIR_UID, name: 'Aarav', color: '#20C4B8', role: 'admin' },
      { pid: 'their-priya', uid: PRIYA_UID, name: 'Priya', color: '#F0A500', role: 'member' },
    ],
    ...over,
  };
}

const group = (db: TestDb) =>
  db.raw.prepare('SELECT name, icon, color, simplify_debt, default_split, created_by FROM budget_group WHERE id = ?').get(FLAT);

/** Who is in the group NOW — removal is soft, so the row itself survives. */
const memberIds = (db: TestDb) =>
  (db.raw.prepare(
    'SELECT person_id FROM group_member WHERE group_id = ? AND deleted_at IS NULL ORDER BY person_id',
  ).all(FLAT) as { person_id: string }[]).map(r => r.person_id);

describe('a republished roster is applied, not discarded', () => {
  it('renames and recolours the group', async () => {
    const s = invitee();
    await adoptGroup(asDb(s.db), FLAT, roster());
    await adoptGroup(asDb(s.db), FLAT, roster({ name: 'Flat 3B', icon: 'coffee', color: '#FF6F61' }));

    expect(group(s.db)).toMatchObject({ name: 'Flat 3B', icon: 'coffee', color: '#FF6F61' });
  });

  it('carries the settings that change what the money looks like', async () => {
    const s = invitee();
    // Adoption used to hardcode simplify_debt = 1 and default_split = 'equal', so
    // the two phones showed different settlement instructions for one ledger.
    await adoptGroup(asDb(s.db), FLAT, roster({ simplifyDebt: 0, defaultSplit: 'shares' }));
    expect(group(s.db)).toMatchObject({ simplify_debt: 0, default_split: 'shares' });
  });

  it('renames a person the roster itself created', async () => {
    const s = invitee();
    await adoptGroup(asDb(s.db), FLAT, roster());
    await adoptGroup(asDb(s.db), FLAT, roster({}, [
      { pid: 'their-me', uid: MY_UID, name: 'Prem', color: '#4F46E5' },
      { pid: 'their-aarav', uid: THEIR_UID, name: 'Aarav', color: '#20C4B8' },
      { pid: 'their-priya', uid: PRIYA_UID, name: 'Priya Sharma', color: '#8B7CF8' },
    ]));

    expect(s.db.raw.prepare('SELECT name, avatar_color FROM person WHERE id = ?').get('their-priya'))
      .toEqual({ name: 'Priya Sharma', avatar_color: '#8B7CF8' });
  });

  it('does NOT rename someone I already knew by account', async () => {
    // They are mine. I added them and I named them, and a group I happen to be in
    // does not get to rename my contacts.
    const s = invitee();
    await adoptGroup(asDb(s.db), FLAT, roster({}, [
      { pid: 'their-aarav', uid: THEIR_UID, name: 'Aarav From Work', color: '#000000' },
    ]));

    expect(s.db.raw.prepare('SELECT name FROM person WHERE id = ?').get(s.aarav))
      .toEqual({ name: 'Aarav' });
  });

  it('removes a member the roster says has left, and keeps the person', async () => {
    const s = invitee();
    await adoptGroup(asDb(s.db), FLAT, roster());
    expect(memberIds(s.db)).toContain('their-priya');

    await adoptGroup(asDb(s.db), FLAT, roster({}, [
      { pid: 'their-me', uid: MY_UID, name: 'Prem', color: '#4F46E5' },
      { pid: 'their-aarav', uid: THEIR_UID, name: 'Aarav', color: '#20C4B8' },
      { pid: 'their-priya', uid: PRIYA_UID, name: 'Priya', color: '#F0A500', removedAt: Date.now() },
    ]));

    expect(memberIds(s.db)).not.toContain('their-priya');
    // The person survives: their history, and any other group, still names them.
    expect(s.db.raw.prepare('SELECT COUNT(*) AS c FROM person WHERE id = ?').get('their-priya'))
      .toEqual({ c: 1 });
  });

  it('treats a roster with no removedAt field as nobody having left', async () => {
    // Backwards compatibility with a roster sealed by an older build. Omission is
    // indistinguishable from a stale roster, which is why absence is not removal.
    const s = invitee();
    await adoptGroup(asDb(s.db), FLAT, roster());
    const before = memberIds(s.db);

    await adoptGroup(asDb(s.db), FLAT, roster({}, [
      { pid: 'their-me', uid: MY_UID, name: 'Prem', color: '#4F46E5' },
      { pid: 'their-aarav', uid: THEIR_UID, name: 'Aarav', color: '#20C4B8' },
      { pid: 'their-priya', uid: PRIYA_UID, name: 'Priya', color: '#F0A500' },
    ]));
    expect(memberIds(s.db)).toEqual(before);
  });
});

describe('an adopted group has an admin', () => {
  it('resolves the creator to my local row for that person', async () => {
    const s = invitee();
    await adoptGroup(asDb(s.db), FLAT, roster());
    expect(group(s.db)).toMatchObject({ created_by: s.aarav });
  });

  it('applies published roles instead of flattening everyone to member', async () => {
    const s = invitee();
    await adoptGroup(asDb(s.db), FLAT, roster());

    const role = (pid: string) =>
      s.db.raw.prepare('SELECT role FROM group_member WHERE group_id = ? AND person_id = ?').get(FLAT, pid);
    expect(role(s.aarav)).toEqual({ role: 'admin' });
    expect(role(s.me)).toEqual({ role: 'member' });
  });

  it('gives the creator every admin power on this device too', async () => {
    const s = invitee();
    await adoptGroup(asDb(s.db), FLAT, roster());

    const ctx = await getGroupContext(asDb(s.db), FLAT, s.aarav);
    expect(isAdmin(ctx)).toBe(true);
    expect(canAddMember(ctx)).toBe(true);
    expect(canDeleteGroup(ctx)).toBe(true);
  });

  it('never clears a creator it cannot resolve', async () => {
    // A roster published by a member whose device cannot resolve the creator
    // carries null. Treating that as "no creator" would strip the admin.
    const s = invitee();
    await adoptGroup(asDb(s.db), FLAT, roster());
    await adoptGroup(asDb(s.db), FLAT, roster({ createdBy: null }));
    expect(group(s.db)).toMatchObject({ created_by: s.aarav });
  });

  it('leaves a promotion in place for the next republish to carry', async () => {
    const s = invitee();
    await adoptGroup(asDb(s.db), FLAT, roster());
    await adoptGroup(asDb(s.db), FLAT, roster({}, [
      { pid: 'their-me', uid: MY_UID, name: 'Prem', color: '#4F46E5', role: 'admin' },
      { pid: 'their-aarav', uid: THEIR_UID, name: 'Aarav', color: '#20C4B8', role: 'admin' },
    ]));
    expect(s.db.raw.prepare('SELECT role FROM group_member WHERE group_id = ? AND person_id = ?').get(FLAT, s.me))
      .toEqual({ role: 'admin' });
  });
});

describe('readRosterDoc publishes what adoptGroup needs', () => {
  it('round-trips creator, roles and settings', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Prem', true);
    db.raw.prepare('UPDATE person SET remote_uid = ? WHERE id = ?').run(MY_UID, me);
    const aarav = addPerson(db, 'Aarav');
    const gid = addGroup(db, 'Flat', false, me);
    addMember(db, gid, me, 'admin');
    addMember(db, gid, aarav, 'member');
    db.raw.prepare("UPDATE budget_group SET simplify_debt = 0, default_split = 'shares' WHERE id = ?").run(gid);

    const doc = await readRosterDoc(asDb(db), gid);

    expect(doc).toMatchObject({ createdBy: MY_UID, simplifyDebt: 0, defaultSplit: 'shares' });
    expect(doc!.members.find(m => m.pid === me)?.role).toBe('admin');
    expect(doc!.members.find(m => m.pid === aarav)?.role).toBe('member');
  });

  it('publishes a null creator rather than a local id nobody else can resolve', async () => {
    // `created_by` is a LOCAL person id. Sending it raw would name a row that does
    // not exist on any other device.
    const db = createTestDb();
    const me = addPerson(db, 'Prem', true);   // no remote_uid: not signed in
    const gid = addGroup(db, 'Flat', false, me);
    addMember(db, gid, me, 'admin');

    expect((await readRosterDoc(asDb(db), gid))?.createdBy).toBeNull();
  });
});
