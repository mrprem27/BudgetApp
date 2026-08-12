import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, addPerson, addGroup, addMember, addCategory, asDb, budgetVia, type TestDb } from './helpers/testDb';
import { getAllGroups, getPersonalGroup, personalGroupOf, sharedGroupsOf } from '../db/queries/groups';
import { getMyGlobalBudgetRows, setMyGlobalBudget } from '../db/queries/categoryBudgets';

/**
 * Which rows are **My Budget** — the question four places used to answer inline,
 * three of them with a `?? groups[0]` fallback that promotes a shared group's
 * budget into the global cap (and, at one call site, labelled that group's
 * transactions "Personal").
 */
describe('the Personal group is the one source of My Budget', () => {
  function seeded() {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    // Shared group created FIRST, so "the oldest group" is not the right answer.
    const shared = addGroup(db, 'Flat', false);
    addMember(db, shared, me);
    const personal = addGroup(db, 'Personal', true);
    addMember(db, personal, me);
    addCategory(db, 'Groceries');
    return { db, me, shared, personal };
  }

  it('finds the personal group even when it is not the oldest', async () => {
    const { db, personal } = seeded();
    expect((await getPersonalGroup(asDb(db)))?.id).toBe(personal);
  });

  it('returns null rather than a shared group when there is no personal one', async () => {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const shared = addGroup(db, 'Flat', false);
    addMember(db, shared, me);

    expect(await getPersonalGroup(asDb(db))).toBeNull();
    expect(personalGroupOf(await getAllGroups(asDb(db)))).toBeNull();
  });

  it('reads only the personal group as My Budget', async () => {
    const { db, me, shared, personal } = seeded();
    await budgetVia(db, shared, [{ category: 'Groceries', cadence: 'monthly', amount: 9_000_00 }], { level: 'group', actorId: me });
    await budgetVia(db, personal, [{ category: 'Groceries', cadence: 'monthly', amount: 8_000_00 }], { level: 'group', actorId: me });

    const mine = await getMyGlobalBudgetRows(asDb(db), me);
    expect(mine.map(r => r.amount)).toEqual([8_000_00]);
  });

  it('writes My Budget to the personal group, leaving a shared group alone', async () => {
    const { db, me, shared, personal } = seeded();
    await budgetVia(db, shared, [{ category: 'Groceries', cadence: 'monthly', amount: 9_000_00 }], { level: 'group', actorId: me });
    await setMyGlobalBudget(asDb(db), [{ category: 'Groceries', cadence: 'monthly', amount: 8_000_00 }], { actorId: me });

    const rows = db.raw.prepare('SELECT group_id, amount FROM category_budget ORDER BY amount').all() as
      { group_id: string; amount: number }[];
    expect(rows).toEqual([
      { group_id: personal, amount: 8_000_00 },
      { group_id: shared, amount: 9_000_00 },
    ]);
  });

  it('excludes the personal group from the groups a rollup may sum', async () => {
    const { db, shared, personal } = seeded();
    const groups = await getAllGroups(asDb(db));
    expect(sharedGroupsOf(groups).map(g => g.id)).toEqual([shared]);
    expect(sharedGroupsOf(groups).some(g => g.id === personal)).toBe(false);
  });
});

/**
 * The scope decision has to stay in one place to stay correct, so this is asserted
 * against the source rather than by behaviour — same approach as `sourceCounts`.
 */
describe('the scope decision is not re-derived anywhere', () => {
  const SRC = path.join(__dirname, '..');
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === '__tests__' ? [] : walk(full);
    return /\.tsx?$/.test(d.name) ? [full] : [];
  });
  /** Comments stripped: these assertions are about the code, and the rules they
   *  enforce are themselves written out in comments that would otherwise match. */
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const sources = walk(SRC).map(f => ({
    file: path.relative(SRC, f),
    text: stripComments(fs.readFileSync(f, 'utf8')),
  }));

  it('selects the personal group with SQL in exactly one file', () => {
    // Only the *lookup* — `transactions.ts` filters transactions on `bg.is_personal`,
    // which is a different question and legitimately its own.
    const hits = sources
      .filter(s => /FROM budget_group WHERE is_personal = 1/.test(s.text))
      .map(s => s.file);
    expect(hits).toEqual(['db/queries/groups.ts']);
  });

  it('keeps the "or else the oldest group" fallback out of everything but one destination', () => {
    // The shape that made a personal-sounding entry point open a shared group's budget
    // editor. `voiceDrain` is the one legitimate holder: it needs somewhere to FILE a
    // dictated expense, and filing it beats dropping it — a different question from
    // which rows are my budget.
    const offenders = sources.filter(s => /\?\?\s*groups\[0\]/.test(s.text)).map(s => s.file);
    expect(offenders).toEqual(['lib/voiceDrain.ts']);
  });
});
