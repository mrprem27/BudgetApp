import { createTestDb } from './helpers/testDb';
import { loadDemoPersona, DEMO_PERSONAS } from '../db/demoPersonas';
import { materializeDueOccurrences } from '../db/queries/recurring';
import { getFinanceSnapshot } from '../db/queries/engineSnapshot';
import { getMyExposure } from '../db/queries/balances';
import { getMe } from '../db/queries/persons';
import { explain } from '../lib/engine/explain';
import { incomeModel } from '../lib/engine/behaviour';
import { horizonDaysFor } from '../lib/engine/projection';
import { getCategories } from '../db/queries/categories';

jest.setTimeout(60_000);

/**
 * Each demo persona exists to put the engine in one state. If a later change moves a persona out
 * of its state, the demo stops showing what it is for — so the state is asserted, not assumed.
 */
async function load(persona: (typeof DEMO_PERSONAS)[number]['key']) {
  const db = createTestDb();
  await loadDemoPersona(db as never, persona);
  await materializeDueOccurrences(db as never);
  const snap = await getFinanceSnapshot(db as never, Date.now());
  const me = (await getMe(db as never))!;
  return { db, snap, exposure: await getMyExposure(db as never, me.id) };
}

describe('demo personas land in the state each is for', () => {
  it('established: a regular salary and a confident verdict', async () => {
    const { snap } = await load('established');
    expect(incomeModel(snap).consistency).toBe('regular');
    expect(explain(snap)).toMatchObject({ confidence: 'high', suppressVerdict: false });
  });

  it('new user: the verdict is held back, and says how long for', async () => {
    const { snap } = await load('newUser');
    const e = explain(snap);
    expect(e.suppressVerdict).toBe(true);
    expect(e.missing).toMatch(/week/);
  });

  it('freelancer: irregular income and a wider horizon', async () => {
    const { snap } = await load('freelancer');
    expect(incomeModel(snap).consistency).toBe('irregular');
    expect(horizonDaysFor(snap)).toBe(60);
    expect(explain(snap).confidence).toBe('medium');
  });

  it('student: owes friends, and nobody owes them', async () => {
    const { exposure } = await load('student');
    expect(exposure.owe).toBeGreaterThan(0);
    expect(exposure.owed).toBe(0);
  });

  it.each(DEMO_PERSONAS.map(p => p.key))('%s uses only categories that exist', async persona => {
    const { db } = await load(persona);
    const known = new Set([...(await getCategories(db as never, 'expense')), ...(await getCategories(db as never, 'income'))].map(c => c.name));
    const used = (db.raw.prepare("SELECT DISTINCT category FROM txn WHERE kind IN ('expense','income') AND is_deleted = 0").all() as { category: string }[]).map(r => r.category);
    // The showcase's `Poker Night` is deliberately someone else's category (the Uncategorized flow).
    expect(used.filter(c => !known.has(c) && c !== 'Poker Night')).toEqual([]);
  });
});

describe('demo data loaded early on the 1st still shows this month', () => {
  // 1 Oct 2026, 09:00 local: "this month" entries were stamped 10:00 or 12:00 today, so they sat
  // in the future and every month figure read zero.
  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date(2026, 9, 1, 9, 0).getTime(),
      doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'],
    });
  });
  afterEach(() => { jest.useRealTimers(); });

  it.each(DEMO_PERSONAS.map(p => p.key))('%s: no logged entry is dated after now', async (persona) => {
    const db = createTestDb();
    await loadDemoPersona(db as never, persona);
    const future = await (db as never as { getAllAsync: <T>(sql: string, p: unknown[]) => Promise<T[]> }).getAllAsync<{ category: string }>(
      'SELECT category FROM txn WHERE recur_freq IS NULL AND is_deleted = 0 AND date > ?', [Date.now()],
    );
    expect(future).toEqual([]);
  });

  it('established: on the 1st, the month holds the starter set and no more', async () => {
    const db = createTestDb();
    await loadDemoPersona(db as never, 'established');
    const start = new Date(2026, 9, 1).getTime();
    const rows = await (db as never as { getAllAsync: <T>(sql: string, p: unknown[]) => Promise<T[]> }).getAllAsync<{ category: string; kind: string }>(
      "SELECT t.category, t.kind FROM txn t JOIN budget_group g ON g.id = t.group_id WHERE g.is_personal = 1 AND t.recur_freq IS NULL AND t.is_deleted = 0 AND t.date >= ? AND t.date <= ?", [start, Date.now()],
    );
    // The salary, the daily chai and the starter set (`U-94`: rent, one grocery run, a meal out, a
    // bill). The other two grocery runs (9th, 15th) and the rest of the month have not happened;
    // all of it used to be clamped onto today.
    expect(rows.some(r => r.kind === 'income' && r.category === 'Salary')).toBe(true);
    expect(rows.filter(r => r.category === 'Rent')).toHaveLength(1);
    expect(rows.filter(r => r.category === 'Groceries')).toHaveLength(1);
    expect(rows.length).toBeLessThan(8);
  });

  it('established: mid-month, the month has its rent, its groceries and its income', async () => {
    jest.setSystemTime(new Date(2026, 9, 20, 15, 0));
    const db = createTestDb();
    await loadDemoPersona(db as never, 'established');
    const start = new Date(2026, 9, 1).getTime();
    const rows = await (db as never as { getAllAsync: <T>(sql: string, p: unknown[]) => Promise<T[]> }).getAllAsync<{ category: string; d: number }>(
      "SELECT t.category, t.date AS d FROM txn t JOIN budget_group g ON g.id = t.group_id WHERE g.is_personal = 1 AND t.recur_freq IS NULL AND t.is_deleted = 0 AND t.date >= ? AND t.date <= ?", [start, Date.now()],
    );
    expect(rows.filter(r => r.category === 'Groceries')).toHaveLength(3);
    expect(rows.filter(r => r.category === 'Rent')).toHaveLength(1);
    // Spread over the month, not on one day.
    expect(new Set(rows.map(r => new Date(r.d).getDate())).size).toBeGreaterThan(10);
  });
});
