import { resolveBudgetLines } from '../lib/budget';
import { openTestDb, seedGroupAndMe } from './dbHarness';

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
