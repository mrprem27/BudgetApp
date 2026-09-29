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
