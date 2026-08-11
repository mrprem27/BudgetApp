import type * as SQLite from 'expo-sqlite';
import { openTestDb, seedGroupAndMe } from './dbHarness';
import { insertCategory, renameCategory, deleteCategory, getCategories } from '../db/queries/categories';
import { seedGlobalCategories } from '../db/seedCategories';

/**
 * `category` is UNIQUE(name, kind), and `Rent` / `Other` are seeded as **both**
 * expense and transfer. Every write that propagates a category name to `txn` or
 * `category_budget` therefore has to say which kind it means; two of them didn't.
 */
const now = Date.now();

async function seed() {
  const db = await openTestDb();
  await seedGroupAndMe(db);
  await db.runAsync(
    `INSERT INTO category (id, group_id, name, icon, color, kind) VALUES
      ('c-exp', NULL, 'Rent', 'home', '#fff', 'expense'),
      ('c-trf', NULL, 'Rent', 'home', '#fff', 'transfer')`,
  );
  // One expense and one transfer, both labelled "Rent".
  await db.runAsync(
    `INSERT INTO txn (id, group_id, kind, entry_mode, date, category, is_deleted, created_at, updated_at)
     VALUES ('t-exp','g','expense','quick',?,'Rent',0,?,?), ('t-trf','g','settlement','quick',?,'Rent',0,?,?)`,
    [now, now, now, now, now, now],
  );
  await db.runAsync(
    `INSERT INTO category_budget (id, group_id, category, period, amount) VALUES ('b1','g','Rent','monthly',5000000)`,
  );
  return db;
}

const catOf = async (db: SQLite.SQLiteDatabase, id: string) =>
  (await db.getFirstAsync<{ category: string }>('SELECT category FROM txn WHERE id=?', [id]))!.category;

describe('renameCategory is kind-scoped', () => {
  it('renaming transfer-Rent leaves expense transactions alone', async () => {
    const db = await seed();
    await renameCategory(db, 'c-trf', 'Flatmate transfer');
    expect(await catOf(db, 't-trf')).toBe('Flatmate transfer');
    // Pre-fix this also became 'Flatmate transfer' — a name the expense catalog
    // lacks — so the expense fell into Others and the Rent budget read ₹0 forever.
    expect(await catOf(db, 't-exp')).toBe('Rent');
  });

  it('renaming transfer-Rent leaves the expense budget line alone', async () => {
    const db = await seed();
    await renameCategory(db, 'c-trf', 'Flatmate transfer');
    const b = await db.getFirstAsync<{ category: string }>('SELECT category FROM category_budget WHERE id=?', ['b1']);
    expect(b!.category).toBe('Rent');
  });

  it('renaming expense-Rent still carries its own txns and budget across', async () => {
    const db = await seed();
    await renameCategory(db, 'c-exp', 'Housing');
    expect(await catOf(db, 't-exp')).toBe('Housing');
    expect(await catOf(db, 't-trf')).toBe('Rent');
    const b = await db.getFirstAsync<{ category: string }>('SELECT category FROM category_budget WHERE id=?', ['b1']);
    expect(b!.category).toBe('Housing');
  });
});

describe('deleteCategory is kind-scoped', () => {
  it('deleting transfer-Rent keeps the expense Rent budget', async () => {
    const db = await seed();
    await deleteCategory(db, 'c-trf');
    const b = await db.getFirstAsync('SELECT * FROM category_budget WHERE id=?', ['b1']);
    expect(b).not.toBeNull();
  });

  it('deleting expense-Rent drops its budget, as before', async () => {
    const db = await seed();
    await deleteCategory(db, 'c-exp');
    const b = await db.getFirstAsync('SELECT * FROM category_budget WHERE id=?', ['b1']);
    expect(b).toBeNull();
  });
});

describe('a deleted seeded category stays deleted', () => {
  it('survives the next launch reseed', async () => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    await seedGlobalCategories(db);
    const before = await getCategories(db, 'expense');
    const victim = before.find(c => c.name === 'Groceries')!;
    expect(victim).toBeDefined();

    await deleteCategory(db, victim.id);
    await seedGlobalCategories(db); // simulates the next openDB

    const after = await getCategories(db, 'expense');
    // Pre-fix the row came straight back, while its budget stayed deleted.
    expect(after.find(c => c.name === 'Groceries')).toBeUndefined();
  });

  it('re-creating it by hand clears the tombstone', async () => {
    const db = await openTestDb();
    await seedGroupAndMe(db);
    await seedGlobalCategories(db);
    const victim = (await getCategories(db, 'expense')).find(c => c.name === 'Groceries')!;

    await deleteCategory(db, victim.id);
    await insertCategory(db, 'Groceries', 'shopping-cart', '#fff', 'expense');
    await seedGlobalCategories(db);

    const after = (await getCategories(db, 'expense')).filter(c => c.name === 'Groceries');
    expect(after).toHaveLength(1);
    const tomb = await db.getAllAsync('SELECT * FROM category_tombstone WHERE name=?', ['Groceries']);
    expect(tomb).toHaveLength(0);
  });

  it('a delete of one kind does not tombstone the other', async () => {
    const db = await seed();
    await deleteCategory(db, 'c-trf');
    await seedGlobalCategories(db);
    const exp = await getCategories(db, 'expense');
    expect(exp.find(c => c.name === 'Rent')).toBeDefined();
  });
});
