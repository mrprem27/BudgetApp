import { openTestDb } from './dbHarness';
import { seedIfNeeded } from '../db/seed';
import { resetToEmpty, loadDemoData } from '../db/seedDemo';
import { getGroupContext } from '../db/queries/groups';
import { canEditGroupBudget } from '../lib/permissions';
import { setCategoryBudgets } from '../db/queries/categoryBudgets';

// `Device.deviceName` is the seeded display name; nothing here depends on its value.
jest.mock('expo-device', () => ({ deviceName: 'Test Phone' }));

/**
 * The Personal group must be administrable by the person it was created for.
 *
 * Three paths build a Personal group and only one of them went through
 * `insertGroup`: `seedIfNeeded` (fresh install), `resetToEmpty` (Settings → reset)
 * and `loadDemoData` both hand-write the row. Both omitted `created_by` and left the
 * membership row at the default `'member'`, which is the same defect `insertGroup`
 * shipped — a group with no admin, whose budget `canEditGroupBudget` then refuses to
 * let anyone edit, with no screen able to repair it.
 *
 * The one-time repair in `ONE_TIME_FIXES` cannot cover the fresh-install case: it is
 * applied and recorded by `openDB`, which runs *before* `seedIfNeeded` in
 * `app/_layout.tsx`, so on a new device the fix completes against an empty database
 * and the broken group appears immediately afterwards. The creation paths have to be
 * right on their own.
 *
 * Asserted through `getGroupContext` + the real permission rule rather than by
 * reading the two columns, because "has an admin" is the property that matters and
 * the columns are only how it is stored.
 */
describe('a seeded Personal group is administrable by me', () => {
  const me = (db: Awaited<ReturnType<typeof openTestDb>>) =>
    db.getFirstAsync<{ id: string }>('SELECT id FROM person WHERE is_me = 1');
  const personal = (db: Awaited<ReturnType<typeof openTestDb>>) =>
    db.getFirstAsync<{ id: string; created_by: string | null }>(
      'SELECT id, created_by FROM budget_group WHERE is_personal = 1');

  it('seedIfNeeded records me as the creator and admin', async () => {
    const db = await openTestDb();
    await seedIfNeeded(db);

    const meRow = await me(db);
    const g = await personal(db);
    expect(g!.created_by).toBe(meRow!.id);
    expect(canEditGroupBudget(await getGroupContext(db, g!.id, meRow!.id))).toBe(true);
  });

  it('lets me set the Personal budget right after a fresh install', async () => {
    const db = await openTestDb();
    await seedIfNeeded(db);
    const meRow = await me(db);
    const g = await personal(db);

    // The failure users would actually hit: first budget on a brand-new device.
    await expect(
      setCategoryBudgets(db, g!.id, [{ category: 'Groceries', cadence: 'monthly', amount: 500000 }],
        { level: 'group', actorId: meRow!.id }),
    ).resolves.not.toThrow();
  });

  it('seedIfNeeded does nothing on a database that already has a person', async () => {
    const db = await openTestDb();
    await seedIfNeeded(db);
    const before = await personal(db);

    await seedIfNeeded(db);
    const groups = await db.getAllAsync<{ id: string }>('SELECT id FROM budget_group');
    expect(groups.map(g => g.id)).toEqual([before!.id]);
  });

  it('resetToEmpty rebuilds a Personal group that still has an admin', async () => {
    const db = await openTestDb();
    await seedIfNeeded(db);
    await resetToEmpty(db);

    const meRow = await me(db);
    const g = await personal(db);
    expect(g!.created_by).toBe(meRow!.id);
    expect(canEditGroupBudget(await getGroupContext(db, g!.id, meRow!.id))).toBe(true);
  });

  it('every group the demo creates has an admin — personal and shared alike', async () => {
    const db = await openTestDb();
    await seedIfNeeded(db);
    await loadDemoData(db);

    const meRow = await me(db);
    const groups = await db.getAllAsync<{ id: string; name: string }>('SELECT id, name FROM budget_group');
    expect(groups.length).toBeGreaterThan(1);
    for (const g of groups) {
      const ctx = await getGroupContext(db, g.id, meRow!.id);
      expect({ group: g.name, canAdmin: canEditGroupBudget(ctx) }).toEqual({ group: g.name, canAdmin: true });
    }
  });
});
