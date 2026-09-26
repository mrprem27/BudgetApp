import type { FinanceSnapshot, Purchase } from '../lib/engine/types';
import { getFinanceSnapshot } from '../db/queries/engineSnapshot';
import { createTestDb } from './helpers/testDb';
import { buildPersona, PERSONA_NOW } from '../db/enginePersonas';
import { afford } from '../lib/engine/assess';
import { defaultNecessity } from '../lib/engine/behaviour';

/**
 * E4's `afford()` (`SPEC-ENGINE.md` §4, task EN4): a verdict on the same
 * uncertainty band `EN3` built, plus the "Tight" budget check.
 *
 * Deliberately not tested here (documented, not silently skipped): a known
 * commitment becoming unfundable within 12 months, and a Want delaying a
 * dated goal past its target — both need machinery (`EN6`, `goalForecast`)
 * that doesn't exist yet. "More income never makes a verdict worse" (§4 E4's
 * own property test) isn't testable either, for the same reason `EN2`
 * excluded income from the projection altogether — there is no income lever
 * to turn yet (`EN5`).
 */

const DAY_MS = 86_400_000;
const R = (rupees: number) => Math.round(rupees * 100);

async function snapshot(kind: Parameters<typeof buildPersona>[1]): Promise<FinanceSnapshot> {
  const db = createTestDb();
  await buildPersona(db, kind);
  return getFinanceSnapshot(db, PERSONA_NOW);
}

function severity(verdict: string): number {
  return verdict === 'comfortable' ? 0 : verdict === 'tight' ? 1 : 2;
}

describe('afford — verdict monotonicity', () => {
  it('never gets better as the amount grows', async () => {
    const snap = await snapshot('salariedRenter');
    const amounts = [0, R(1_000), R(5_000), R(20_000), R(60_000), R(150_000), R(400_000)];
    const verdicts = amounts.map(amountPaise => afford(snap, { amountPaise, when: 'now' }).verdict);
    for (let i = 1; i < verdicts.length; i++) {
      expect(severity(verdicts[i])).toBeGreaterThanOrEqual(severity(verdicts[i - 1]));
    }
  });
});

describe('afford — Comfortable ⟺ amount ≤ largestComfortableAmount (no budget reason)', () => {
  it('holds across a range of amounts when the purchase has no category (so no budget line can apply)', async () => {
    const snap = await snapshot('salariedRenter');
    const probe = afford(snap, { amountPaise: 1, when: 'now' });
    const max = probe.largestComfortableAmount;

    for (const amountPaise of [0, max - R(1_000), max, max + R(1_000), max + R(50_000)]) {
      if (amountPaise < 0) continue;
      const result = afford(snap, { amountPaise, when: 'now' });
      expect(result.verdict === 'comfortable').toBe(amountPaise <= max);
    }
  });
});

describe('afford — "not affordable" tracks the projected low point exactly', () => {
  it('never fires while the after-purchase low point is ≥ 0, and always fires when it is < 0', async () => {
    const snap = await snapshot('salariedRenter');
    const amounts = [0, R(500), R(10_000), R(50_000), R(200_000), R(500_000), R(1_000_000)];
    for (const amountPaise of amounts) {
      const result = afford(snap, { amountPaise, when: 'now' });
      expect(result.verdict === 'not-affordable').toBe(result.lowPointAfter.amount < 0);
    }
  });
});

describe('afford — a recurring purchase is judged more heavily than the same one-time amount', () => {
  it('a weekly ₹2,000 habit leaves a worse low point than a single ₹2,000 purchase', async () => {
    const snap = await snapshot('salariedRenter');
    // Weekly, not monthly: within the 30-day safety horizon a monthly
    // recurrence typically lands once, same as a one-time purchase — telling
    // them apart needs the 12-month view (`EN6`), not built yet. Weekly reliably
    // lands several times inside 30 days regardless of the calendar, which is
    // what actually exercises "recurring is heavier" in this slice.
    const oneTime = afford(snap, { amountPaise: R(2_000), category: 'Shopping', when: 'now' });
    const weekly = afford(snap, { amountPaise: R(2_000), category: 'Shopping', when: 'now', recurrence: 'weekly' });
    expect(weekly.lowPointAfter.amount).toBeLessThan(oneTime.lowPointAfter.amount);
  });
});

describe('afford — persona goldens', () => {
  it('a ₹10,000 phone is Comfortable for the well-funded salaried persona', async () => {
    const snap = await snapshot('salariedRenter');
    const result = afford(snap, { amountPaise: R(10_000), category: 'Electronics', when: 'now' });
    expect(result.verdict).toBe('comfortable');
  });

  it('a large purchase is Tight or Not affordable for the stretched student persona', async () => {
    const snap = await snapshot('student');
    const result = afford(snap, { amountPaise: R(5_000), when: 'now' });
    expect(result.verdict).not.toBe('comfortable');
  });
});

describe('afford — over-budget is a Tight reason on its own', () => {
  it('flags a category over its own explicit monthly budget even with plenty of cash', () => {
    // 35 days of trivial, unrelated history — enough to clear EN7's thin-data
    // gate (`explain()`), which otherwise suppresses the verdict outright.
    const history = Array.from({ length: 35 }, (_, i) => ({
      id: `h${i}`, date: PERSONA_NOW - (35 - i) * 86_400_000, kind: 'expense' as const,
      category: 'Shopping', amountPaise: R(10), isRecurringLinked: false,
    }));
    const snap: FinanceSnapshot = {
      asOf: PERSONA_NOW,
      meId: 'me',
      cash: { available: R(500_000), creditUsed: 0, creditLimit: 0, cardDueDay: null },
      recurring: { rules: [], skips: {} },
      goals: { list: [], savedByGoal: {}, funding: { commitMonthly: 0, fundedThisMonth: 0, remaining: 0, goalsCount: 0 } },
      exposure: { owe: 0, owed: 0, owedExpected: 0, net: 0, owePeople: 0, owedPeople: 0, perPerson: [] },
      receivables: [],
      budgets: [{ id: 'b1', group_id: 'g', category: 'Dining', cadence: 'monthly', amount: R(1_000), person_id: null }],
      history,
      futureOneOffs: [],
    };
    const result = afford(snap, { amountPaise: R(1_500), category: 'Dining', when: 'now' });
    expect(result.verdict).toBe('tight');
    expect(result.reasons.some(r => r.code === 'over_budget')).toBe(true);
    // Nothing else should be pushing this to Tight — huge cash, no other bills.
    expect(result.lowPointAfter.amount).toBeGreaterThan(0);
  });
});

describe('afford — necessity defaults from the category seed', () => {
  it('pre-fills Need/Want the same way behaviour.ts\'s seed does', async () => {
    const snap = await snapshot('salariedRenter');
    const rent = afford(snap, { amountPaise: R(100), category: 'Rent', when: 'now' });
    const shopping = afford(snap, { amountPaise: R(100), category: 'Shopping', when: 'now' });
    expect(defaultNecessity('Rent')).toBe('need');
    expect(defaultNecessity('Shopping')).toBe('want');
    // afford() doesn't echo necessity back today (it only feeds a future Tight
    // rule this slice doesn't implement — the goal-delay row), so this just
    // pins that resolving it doesn't throw and both still evaluate.
    expect(['comfortable', 'tight', 'not-affordable']).toContain(rent.verdict);
    expect(['comfortable', 'tight', 'not-affordable']).toContain(shopping.verdict);
  });
});

describe('afford — can-wait', () => {
  it('a one-time purchase never finds a later Comfortable date in this income-less slice', async () => {
    // Every day's balance is non-increasing with no income modelled (`EN2`'s
    // own file header) — a one-time purchase's effect on the path's own low
    // point (always the final day) is the same flat `amount` wherever inside
    // the horizon it lands. So if today's answer isn't Comfortable, no later
    // day within the horizon can be either. That's a real, honest limit of
    // this slice, not a bug — `EN5` (income) is what actually unlocks this.
    const snap = await snapshot('student');
    const result = afford(snap, { amountPaise: R(50_000), when: 'can-wait' });
    expect(result.verdict).not.toBe('comfortable');
    expect(result.earliestComfortableDate).toBeUndefined();
  });

  it('a recurring purchase CAN find a later Comfortable date — delaying it fits fewer occurrences before the horizon ends', async () => {
    const snap = await snapshot('salariedRenter');
    const weekly: Purchase = { amountPaise: R(10_000), category: 'Shopping', when: 'can-wait', recurrence: 'weekly' };
    const today = afford(snap, weekly);
    expect(today.verdict).not.toBe('comfortable'); // 5 occurrences inside 30 days, deliberately large
    expect(today.earliestComfortableDate).toBeDefined();
    expect(today.earliestComfortableDate!).toBeGreaterThan(snap.asOf);
    expect(today.earliestComfortableDate!).toBeLessThanOrEqual(snap.asOf + 30 * DAY_MS);
  });
});
