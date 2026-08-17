import { openTestDb } from './dbHarness';
import { reorderGoals, getGoals } from '../db/queries/savings';

/**
 * `sort_order` is one ranking over EVERY goal, but the drag list only ever shows
 * the active ones — so writing `0..n-1` for that subset left completed goals
 * holding stale values that interleaved with the user's fresh ordering.
 */
async function seed() {
  const db = await openTestDb();
  const rows: Array<[string, number, number]> = [
    // id, sort_order, created_at
    ['a', 0, 1], ['b', 1, 2], ['done1', 2, 3], ['c', 3, 4], ['done2', 4, 5],
  ];
  for (const [id, order, created] of rows) {
    await db.runAsync(
      `INSERT INTO savings_goal (id, name, target, priority, allocation, frequency, locked, is_archived, sort_order, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, id, 100000, 'need', 0, 'none', 0, 0, order, created],
    );
  }
  return db;
}

const orderOf = async (db: Awaited<ReturnType<typeof openTestDb>>) => {
  const rows = await db.getAllAsync<{ id: string; sort_order: number }>(
    'SELECT id, sort_order FROM savings_goal ORDER BY sort_order ASC',
  );
  return rows.map(r => r.id);
};

describe('reorderGoals writes a total permutation', () => {
  it('does not leave unranked goals interleaved with ranked ones', async () => {
    const db = await seed();
    await reorderGoals(db, ['c', 'a', 'b']); // only the active goals were dragged
    // Pre-fix: c=0, a=1, b=2 while done1 kept 2 and done2 kept 4 — done1 tied with
    // b, and done2 sat inside the ranking entirely.
    expect(await orderOf(db)).toEqual(['c', 'a', 'b', 'done1', 'done2']);
  });

  it('assigns every goal a distinct sort_order', async () => {
    const db = await seed();
    await reorderGoals(db, ['c', 'a', 'b']);
    const rows = await db.getAllAsync<{ sort_order: number }>('SELECT sort_order FROM savings_goal');
    expect(new Set(rows.map(r => r.sort_order)).size).toBe(rows.length);
  });

  it('keeps the unranked goals in their own relative order', async () => {
    const db = await seed();
    await reorderGoals(db, ['b']);
    const all = await orderOf(db);
    expect(all[0]).toBe('b');
    expect(all.indexOf('done1')).toBeLessThan(all.indexOf('done2'));
  });

  it('is a no-op for an empty list rather than renumbering everything', async () => {
    const db = await seed();
    const before = await orderOf(db);
    await reorderGoals(db, []);
    expect(await orderOf(db)).toEqual(before);
  });

  it('is idempotent — re-applying the same order changes nothing', async () => {
    const db = await seed();
    await reorderGoals(db, ['c', 'a', 'b']);
    const once = await orderOf(db);
    await reorderGoals(db, ['c', 'a', 'b']);
    expect(await orderOf(db)).toEqual(once);
  });
});
