import {
  markRosterDirty, dirtyRosters, clearRosterDirty, nextRosterVersion, setRosterVersion,
} from '../db/queries/syncDoc';
import { addMemberToGroup, removeMemberFromGroup, updatePersonName } from '../db/queries/persons';
import { updateGroup } from '../db/queries/groups';
import { createTestDb, addPerson, addGroup, addMember, asDb } from './helpers/testDb';

/**
 * The roster has to stay current, or entries start disappearing.
 *
 * It used to be published once, when a group was shared. Everything afterwards —
 * adding a flatmate, renaming the group, someone changing their name — never
 * reached the other phones. That is not cosmetic: an entry naming a member the
 * other device has never heard of cannot be resolved, so it is refused. Adding
 * somebody to a shared group silently broke every entry that mentioned them.
 */
describe('a roster that changed needs republishing', () => {
  async function shared() {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const aarav = addPerson(db, 'Aarav');
    const flat = addGroup(db, 'Flat');
    addMember(db, flat, me); addMember(db, flat, aarav);
    await clearRosterDirty(asDb(db), flat);   // start from a clean, published state
    return { db, me, aarav, flat };
  }

  it('marks it when somebody joins the group', async () => {
    const { db, me, flat } = await shared();
    const ravi = addPerson(db, 'Ravi');
    await addMemberToGroup(asDb(db), flat, ravi, me);
    expect(await dirtyRosters(asDb(db))).toContain(flat);
  });

  it('marks it when somebody leaves', async () => {
    const { db, me, flat, aarav } = await shared();
    await removeMemberFromGroup(asDb(db), flat, aarav, me);
    expect(await dirtyRosters(asDb(db))).toContain(flat);
  });

  it('marks it when a member is renamed', async () => {
    // A name only this phone knows is a person nobody else recognises.
    const { db, flat, aarav } = await shared();
    await updatePersonName(asDb(db), aarav, 'Aarav K');
    expect(await dirtyRosters(asDb(db))).toContain(flat);
  });

  it('marks it when the group itself is renamed', async () => {
    const { db, me, flat } = await shared();
    await updateGroup(asDb(db), flat, 'The Flat', 'home', '#20C4B8', undefined, me);
    expect(await dirtyRosters(asDb(db))).toContain(flat);
  });

  it('never marks a personal group — there is nobody to tell', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const personal = addGroup(db, 'Personal', true);
    addMember(db, personal, me);
    const other = addPerson(db, 'Someone');

    await addMemberToGroup(asDb(db), personal, other, me);
    await markRosterDirty(asDb(db), personal);

    // Enforced in the SQL, not at the call site — a writer that has to remember
    // cannot be relied on to.
    expect(await dirtyRosters(asDb(db))).not.toContain(personal);
  });

  it('clears once published, and does not re-fire on its own', async () => {
    const { db, me, flat } = await shared();
    const ravi = addPerson(db, 'Ravi');
    await addMemberToGroup(asDb(db), flat, ravi, me);

    await clearRosterDirty(asDb(db), flat);
    expect(await dirtyRosters(asDb(db))).not.toContain(flat);
  });
});

/**
 * The version counter.
 *
 * The server compare-and-sets on it. The first cut guessed by trying 1, 2 then 3
 * and giving up — which silently stopped republishing on the fourth change a
 * group ever had, and stopping silently is the whole failure mode here.
 */
describe('roster versions', () => {
  it('starts at 1 and climbs', async () => {
    const db = createTestDb();
    const g = addGroup(db, 'Flat');
    expect(await nextRosterVersion(asDb(db), g)).toBe(1);

    await setRosterVersion(asDb(db), g, 1);
    expect(await nextRosterVersion(asDb(db), g)).toBe(2);

    await setRosterVersion(asDb(db), g, 7);
    expect(await nextRosterVersion(asDb(db), g)).toBe(8);
  });

  it('keeps a version per group', async () => {
    const db = createTestDb();
    const a = addGroup(db, 'Flat');
    const b = addGroup(db, 'Trip');
    await setRosterVersion(asDb(db), a, 5);
    expect(await nextRosterVersion(asDb(db), b)).toBe(1);
  });
});
