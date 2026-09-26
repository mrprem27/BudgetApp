import { createTestDb } from './helpers/testDb';
import { combinableWith, countCombinableEntries } from '../db/queries/persons';
import { insertGroup } from '../db/queries/groups';
import { addMemberToGroup } from '../db/queries/persons';
import { insertTxn } from '../db/queries/transactions';

/**
 * "Same person as…" (`DQ-94` part 2, task P3): who the picker offers, and how
 * many entries the confirm says will move. Both back the sheet in
 * `CombineSameSheet.tsx` — this is the query half, so a wrong filter here is
 * caught without rendering anything.
 */

const ME = 'local-me';

async function world() {
  const db = createTestDb();
  db.raw.prepare("INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, 'Prem', '#20C4B8', 1)").run(ME);
  const a = 'p-a';
  const b = 'p-b';
  db.raw.prepare("INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, 'Aarav', '#8B7CF8', 0)").run(a);
  db.raw.prepare("INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, 'Aarav K', '#3ECF8E', 0)").run(b);
  const g = await insertGroup(db, 'Flat', 'home', '#20C4B8', [], 'equal', ME);
  await addMemberToGroup(db, g.id, a, ME);
  await addMemberToGroup(db, g.id, b, ME);
  return { db, a, b, groupId: g.id };
}

describe('combinableWith', () => {
  it('offers every other real person, never "me" and never itself', async () => {
    const { db, a, b } = await world();
    const forA = await combinableWith(db, a);
    expect(forA.map(p => p.id).sort()).toEqual([b].sort());
    expect(forA.some(p => p.is_me === 1)).toBe(false);
  });

  it('excludes anyone already linked to a DIFFERENT account — the pair combinePeople would refuse', async () => {
    const { db, a, b } = await world();
    db.raw.prepare('UPDATE person SET remote_uid = ? WHERE id = ?').run('account-x', a);
    db.raw.prepare('UPDATE person SET remote_uid = ? WHERE id = ?').run('account-y', b);
    expect(await combinableWith(db, a)).toEqual([]);
  });

  it('still offers a plain placeholder with no account, even when this person has one', async () => {
    const { db, a, b } = await world();
    db.raw.prepare('UPDATE person SET remote_uid = ? WHERE id = ?').run('account-x', a);
    // b has no remote_uid at all — nothing to clash with, still combinable.
    // (Two rows can never share one remote_uid — `person.remote_uid` is UNIQUE —
    // so "linked to the SAME account" can't arise as a second row to test.)
    expect((await combinableWith(db, a)).map(p => p.id)).toEqual([b]);
  });

  it('returns nothing for an id that does not exist', async () => {
    const { db } = await world();
    expect(await combinableWith(db, 'no-such-person')).toEqual([]);
  });
});

describe('countCombinableEntries', () => {
  it('counts distinct transactions, not one row per payer/split', async () => {
    const { db, a, groupId } = await world();
    expect(await countCombinableEntries(db, a)).toBe(0);
    await insertTxn(db, {
      groupId, kind: 'expense', entryMode: 'quick', date: Date.now(), category: 'Food',
      payments: [{ personId: a, amount: 30000 }],
      shares: [{ personId: ME, amount: 15000 }, { personId: a, amount: 15000 }],
    });
    // One transaction names `a` twice (payer AND a split) — still one entry.
    expect(await countCombinableEntries(db, a)).toBe(1);
  });
});
