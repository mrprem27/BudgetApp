import { openTestDb, seedGroupAndMe } from './dbHarness';
import { getUncategorizedNames, insertCategory } from '../db/queries/categories';
import { OTHERS_LABEL } from '../lib/categoryFold';

/**
 * A category name outside your catalog can come from a transaction OR from a
 * budget line. Only the first was ever surfaced, so a name that had only ever
 * been budgeted — an admin's group default for a category you deleted, or data
 * from a restore — appeared on no screen and could be adopted from nowhere.
 */
const now = Date.now();

async function seed() {
  const db = await openTestDb();
  await seedGroupAndMe(db);
  await db.runAsync(
    `INSERT INTO category (id, group_id, name, icon, color, kind)
     VALUES ('c1', NULL, 'Groceries', 'shopping-cart', '#fff', 'expense')`,
  );
  return db;
}

const txn = (db: Awaited<ReturnType<typeof openTestDb>>, id: string, category: string) =>
  db.runAsync(
    `INSERT INTO txn (id, group_id, kind, entry_mode, date, category, is_deleted, created_at, updated_at)
     VALUES (?, 'g', 'expense', 'quick', ?, ?, 0, ?, ?)`,
    [id, now, category, now, now],
  );

const budget = (db: Awaited<ReturnType<typeof openTestDb>>, id: string, category: string) =>
  db.runAsync(
    `INSERT INTO category_budget (id, group_id, category, period, cadence, amount, person_id)
     VALUES (?, 'g', ?, 'monthly', 'monthly', 200000, NULL)`,
    [id, category],
  );

const names = async (db: Awaited<ReturnType<typeof openTestDb>>) =>
  (await getUncategorizedNames(db, 'expense')).map(u => u.name).sort();

describe('getUncategorizedNames covers both sources', () => {
  it('surfaces a name that only ever had a BUDGET — the case that was invisible', async () => {
    const db = await seed();
    await budget(db, 'b1', 'Gym');
    const out = await getUncategorizedNames(db, 'expense');
    expect(out).toEqual([{ name: 'Gym', count: 0, budgeted: true }]);
  });

  it('still surfaces a name that only appears on transactions', async () => {
    const db = await seed();
    await txn(db, 't1', 'Chai');
    await txn(db, 't2', 'Chai');
    expect(await getUncategorizedNames(db, 'expense'))
      .toEqual([{ name: 'Chai', count: 2, budgeted: false }]);
  });

  it('reports a name with BOTH sources exactly once', async () => {
    const db = await seed();
    await txn(db, 't1', 'Gym');
    await budget(db, 'b1', 'Gym');
    const out = await getUncategorizedNames(db, 'expense');
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ name: 'Gym', count: 1, budgeted: true });
  });

  it('does not report a category that IS in the catalog, budgeted or not', async () => {
    const db = await seed();
    await txn(db, 't1', 'Groceries');
    await budget(db, 'b1', 'Groceries');
    expect(await names(db)).toEqual([]);
  });

  it('never offers "Others" — it is the display bucket, not a category', async () => {
    const db = await seed();
    await txn(db, 't1', OTHERS_LABEL);
    await budget(db, 'b1', OTHERS_LABEL);
    expect(await names(db)).toEqual([]);
  });

  it('ignores recurring templates, as the transaction half always did', async () => {
    const db = await seed();
    await db.runAsync(
      `INSERT INTO txn (id, group_id, kind, entry_mode, date, category, recur_freq, is_deleted, created_at, updated_at)
       VALUES ('r1','g','expense','quick',?,'Gym','monthly',0,?,?)`, [now, now, now],
    );
    expect(await names(db)).toEqual([]);
  });

  it('ignores soft-deleted transactions', async () => {
    const db = await seed();
    await db.runAsync(
      `INSERT INTO txn (id, group_id, kind, entry_mode, date, category, is_deleted, created_at, updated_at)
       VALUES ('t1','g','expense','quick',?,'Chai',1,?,?)`, [now, now, now],
    );
    expect(await names(db)).toEqual([]);
  });
});

describe('adopting resolves the name', () => {
  it('removes it from the outside set, and moves no money', async () => {
    const db = await seed();
    await budget(db, 'b1', 'Gym');
    await txn(db, 't1', 'Gym');

    const amountBefore = await db.getAllAsync('SELECT amount FROM category_budget');
    await insertCategory(db, 'Gym', 'activity', '#fff', 'expense', 'Other');

    expect(await names(db)).toEqual([]);
    // Adoption is a catalog change; the budget row is untouched.
    expect(await db.getAllAsync('SELECT amount FROM category_budget')).toEqual(amountBefore);
  });

  it('leaves other outside names alone', async () => {
    const db = await seed();
    await budget(db, 'b1', 'Gym');
    await txn(db, 't1', 'Chai');
    await insertCategory(db, 'Gym', 'activity', '#fff', 'expense', 'Other');
    expect(await names(db)).toEqual(['Chai']);
  });
});

describe('non-expense kinds', () => {
  it('do not union budget lines, since budgets are expense-only', async () => {
    const db = await seed();
    await budget(db, 'b1', 'Gym');
    // Asking for income must not drag an expense budget name in.
    expect((await getUncategorizedNames(db, 'income')).map(u => u.name)).toEqual([]);
  });
});
