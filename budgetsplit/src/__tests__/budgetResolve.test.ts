import { getCategoryBudgetStatus, resolveBudgetLines } from '../lib/budget';
import { openTestDb, seedGroupAndMe } from './dbHarness';
import { setCategoryBudgets } from '../db/queries/categoryBudgets';

type Line = { category: string; cadence: 'daily' | 'monthly' | 'yearly' | 'once'; amount: number; person_id: string | null };
const line = (category: string, amount: number, person_id: string | null, cadence: Line['cadence'] = 'monthly'): Line =>
  ({ category, cadence, amount, person_id });

const ME = 'me';
const OTHER = 'rohan';

/**
 * `category_budget.person_id` NULL is the group default every member inherits;
 * set is a personal override that wins for its owner and nobody else.
 */
describe('resolveBudgetLines', () => {
  it('falls through to the group default when I have no override', () => {
    const out = resolveBudgetLines([line('Groceries', 500000, null)], ME);
    expect(out).toEqual([line('Groceries', 500000, null)]);
  });

  it('lets my override beat the default', () => {
    const out = resolveBudgetLines([line('Groceries', 500000, null), line('Groceries', 800000, ME)], ME);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(800000);
  });

  it('is order-independent — the override wins whichever row arrives first', () => {
    const a = resolveBudgetLines([line('G', 500000, null), line('G', 800000, ME)], ME);
    const b = resolveBudgetLines([line('G', 800000, ME), line('G', 500000, null)], ME);
    expect(a[0].amount).toBe(800000);
    expect(b[0].amount).toBe(800000);
  });

  it('never leaks someone else’s override to me', () => {
    const out = resolveBudgetLines([line('Groceries', 500000, null), line('Groceries', 100, OTHER)], ME);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(500000);
  });

  it('does not invent a default from someone else’s override alone', () => {
    // Rohan has a line, the group has none, and I have none: I have no budget.
    expect(resolveBudgetLines([line('Groceries', 100, OTHER)], ME)).toEqual([]);
  });

  it('keeps an override that has no default behind it', () => {
    const out = resolveBudgetLines([line('Gym', 200000, ME)], ME);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(200000);
  });

  it('resolves each cadence of one category independently', () => {
    // Overriding the monthly line must not discard the yearly default.
    const out = resolveBudgetLines([
      line('Travel', 300000, null, 'monthly'),
      line('Travel', 2400000, null, 'yearly'),
      line('Travel', 100000, ME, 'monthly'),
    ], ME);
    expect(out).toHaveLength(2);
    expect(out.find(l => l.cadence === 'monthly')!.amount).toBe(100000);
    expect(out.find(l => l.cadence === 'yearly')!.amount).toBe(2400000);
  });

  it('returns only defaults when no one is asking — an anonymous read sees the group line', () => {
    const out = resolveBudgetLines([line('G', 500000, null), line('G', 800000, ME)], undefined);
    expect(out).toHaveLength(1);
    expect(out[0].person_id).toBeNull();
  });
});

/**
 * The uniqueness trap. `UNIQUE(group_id, category, period, person_id)` looks right
 * and silently does nothing at the default level, because SQL treats NULLs as
 * distinct — one category could accumulate unlimited group-default rows. Two
 * partial indexes express what was actually meant.
 */
describe('budget uniqueness holds at BOTH levels', () => {
  async function db() {
    const d = await openTestDb();
    await seedGroupAndMe(d);
    return d;
  }
  const insert = (d: Awaited<ReturnType<typeof openTestDb>>, id: string, person: string | null) =>
    d.runAsync(
      `INSERT INTO category_budget (id, group_id, category, period, cadence, amount, person_id)
       VALUES (?, 'g', 'Groceries', 'monthly', 'monthly', 500000, ?)`,
      [id, person],
    );

  it('rejects a second GROUP DEFAULT for the same category', async () => {
    const d = await db();
    await insert(d, 'b1', null);
    await expect(insert(d, 'b2', null)).rejects.toThrow();
  });

  it('rejects a second override for the same person and category', async () => {
    const d = await db();
    await insert(d, 'b1', 'me');
    await expect(insert(d, 'b2', 'me')).rejects.toThrow();
  });

  it('still allows one default plus one override per person', async () => {
    const d = await db();
    await insert(d, 'b1', null);
    await insert(d, 'b2', 'me');
    await insert(d, 'b3', 'rohan');
    const rows = await d.getAllAsync('SELECT id FROM category_budget');
    expect(rows).toHaveLength(3);
  });
});

/**
 * The "no data migration" claim rests on this: `person_id` is nullable and
 * defaults to NULL, so every budget that existed before the two-level model keeps
 * applying to everyone rather than silently becoming one person's private line.
 */
describe('pre-existing budget rows stay group defaults', () => {
  it('a row written without person_id reads back as the group default', async () => {
    const d = await openTestDb();
    await seedGroupAndMe(d);
    // Exactly the shape the old writer produced — no person_id column mentioned.
    await d.runAsync(
      `INSERT INTO category_budget (id, group_id, category, period, cadence, amount)
       VALUES ('legacy', 'g', 'Groceries', 'monthly', 'monthly', 500000)`,
    );
    const rows = await d.getAllAsync<{ person_id: string | null }>('SELECT person_id FROM category_budget');
    expect(rows).toEqual([{ person_id: null }]);
  });

  it('and therefore still resolves for a person who has no override', async () => {
    const d = await openTestDb();
    await seedGroupAndMe(d);
    await d.runAsync(
      `INSERT INTO category_budget (id, group_id, category, period, cadence, amount)
       VALUES ('legacy', 'g', 'Groceries', 'monthly', 'monthly', 500000)`,
    );
    const rows = await d.getAllAsync<{ category: string; cadence: 'monthly'; amount: number; person_id: string | null }>(
      'SELECT category, cadence, amount, person_id FROM category_budget');
    expect(resolveBudgetLines(rows, 'me')).toHaveLength(1);
  });
});

/**
 * The fold, end-to-end through the real reader — not just the pure function.
 * This is the wiring that was missing: `getCategoryBudgetStatus` returned the
 * unknown category verbatim while spend for it folded into Others.
 */
describe('getCategoryBudgetStatus folds against the catalog', () => {
  const group = { id: 'g', name: 'Flat', is_personal: 0 } as never;

  async function seed() {
    const d = await openTestDb();
    await seedGroupAndMe(d);
    // Catalog has Groceries only. The group budgets Gym too — possible because
    // category_budget.category is a name, not a foreign key.
    await d.runAsync(
      `INSERT INTO category (id, group_id, name, icon, color, kind)
       VALUES ('c1', NULL, 'Groceries', 'shopping-cart', '#fff', 'expense')`,
    );
    await d.runAsync(
      `INSERT INTO category_budget (id, group_id, category, period, cadence, amount)
       VALUES ('b1','g','Groceries','monthly','monthly',500000),
              ('b2','g','Gym','monthly','monthly',200000)`,
    );
    return d;
  }

  it('shows Gym as Others while it is absent from the catalog', async () => {
    const d = await seed();
    const rows = await getCategoryBudgetStatus(d, group, new Date(), 'me');
    expect(rows.map(r => r.category).sort()).toEqual(['Groceries', 'Others']);
    expect(rows.find(r => r.category === 'Others')!.allocated).toBe(200000);
  });

  it('shows Gym as itself once the category is created', async () => {
    const d = await seed();
    await d.runAsync(
      `INSERT INTO category (id, group_id, name, icon, color, kind)
       VALUES ('c2', NULL, 'Gym', 'activity', '#fff', 'expense')`,
    );
    const rows = await getCategoryBudgetStatus(d, group, new Date(), 'me');
    expect(rows.map(r => r.category).sort()).toEqual(['Groceries', 'Gym']);
    expect(rows.find(r => r.category === 'Gym')!.allocated).toBe(200000);
  });

  it('keeps the same total across that change — nothing is redistributed', async () => {
    const d = await seed();
    const before = await getCategoryBudgetStatus(d, group, new Date(), 'me');
    await d.runAsync(
      `INSERT INTO category (id, group_id, name, icon, color, kind)
       VALUES ('c2', NULL, 'Gym', 'activity', '#fff', 'expense')`,
    );
    const after = await getCategoryBudgetStatus(d, group, new Date(), 'me');
    const total = (rs: Awaited<ReturnType<typeof getCategoryBudgetStatus>>) =>
      rs.reduce((s, r) => s + r.allocated, 0);
    expect(total(before)).toBe(700000);
    expect(total(after)).toBe(total(before));
  });
});

/**
 * Saving must not delete what the editor could not show.
 *
 * `setCategoryBudgets` is a whole-level replace and `entries` comes from the
 * caller's catalog — so a line for a category absent from that catalog (the very
 * case `foldBudgetStatuses` renders as Others) was erased by any save. An admin
 * opening the budget and pressing Save silently dropped a default they had never
 * seen. The suite passed with this present, which is why it is pinned here.
 */
describe('setCategoryBudgets preserves lines outside the catalog', () => {
  async function seed() {
    const d = await openTestDb();
    await seedGroupAndMe(d);
    await d.runAsync(
      `INSERT INTO category (id, group_id, name, icon, color, kind)
       VALUES ('c1', NULL, 'Groceries', 'shopping-cart', '#fff', 'expense')`,
    );
    await d.runAsync(
      `INSERT INTO category_budget (id, group_id, category, period, cadence, amount, person_id)
       VALUES ('b1','g','Groceries','monthly','monthly',500000,NULL),
              ('b2','g','Gym','monthly','monthly',200000,NULL)`,
    );
    // What the creator backfill gives every pre-existing group; without it the
    // write path correctly refuses, since editing the group default needs admin.
    await d.runAsync("UPDATE budget_group SET created_by = 'me' WHERE id = 'g'");
    await d.runAsync("UPDATE group_member SET role = 'admin' WHERE group_id = 'g' AND person_id = 'me'");
    return d;
  }
  const rows = (d: Awaited<ReturnType<typeof openTestDb>>) =>
    d.getAllAsync<{ category: string; amount: number }>(
      'SELECT category, amount FROM category_budget ORDER BY category');

  it('keeps the uneditable line when the group budget is saved', async () => {
    const d = await seed();
    // What the editor would submit: its catalog only, so Gym is simply absent.
    await setCategoryBudgets(d, 'g', [{ category: 'Groceries', cadence: 'monthly', amount: 600000 }],
      { level: 'group', actorId: 'me' });
    expect(await rows(d)).toEqual([
      { category: 'Groceries', amount: 600000 },  // updated
      { category: 'Gym', amount: 200000 },        // preserved, was silently deleted
    ]);
  });

  it('still removes a catalog category the user cleared to zero', async () => {
    const d = await seed();
    // Groceries omitted = cleared. It IS in the catalog, so it is the user's call.
    await setCategoryBudgets(d, 'g', [], { level: 'group', actorId: 'me' });
    expect(await rows(d)).toEqual([{ category: 'Gym', amount: 200000 }]);
  });

  it('lets an explicit entry overwrite an out-of-catalog line', async () => {
    const d = await seed();
    // Adopting Gym and budgeting it should replace, not duplicate.
    await setCategoryBudgets(d, 'g', [{ category: 'Gym', cadence: 'monthly', amount: 300000 }],
      { level: 'group', actorId: 'me' });
    expect(await rows(d)).toEqual([{ category: 'Gym', amount: 300000 }]);
  });

  it('does not let a personal save touch the group default', async () => {
    const d = await seed();
    await setCategoryBudgets(d, 'g', [{ category: 'Groceries', cadence: 'monthly', amount: 100000 }],
      { level: 'personal', actorId: 'me' });
    const all = await d.getAllAsync<{ category: string; amount: number; person_id: string | null }>(
      'SELECT category, amount, person_id FROM category_budget ORDER BY person_id, category');
    // Both defaults intact, plus the new override.
    expect(all).toEqual([
      { category: 'Groceries', amount: 500000, person_id: null },
      { category: 'Gym', amount: 200000, person_id: null },
      { category: 'Groceries', amount: 100000, person_id: 'me' },
    ]);
  });
});
