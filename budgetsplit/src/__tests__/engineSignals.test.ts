import type { FinanceSnapshot } from '../lib/engine/types';
import { lowPointWarning } from '../lib/engine/signals';
import { createTestDb } from './helpers/testDb';
import { buildPersona, PERSONA_KINDS, PERSONA_NOW } from '../db/enginePersonas';
import { getFinanceSnapshot } from '../db/queries/engineSnapshot';

/**
 * `EN12` — the one signal v1 keeps (`SPEC-ENGINE.md` §4.2): a warning when the
 * projected balance dips below the essential floor within 14 days.
 */
const DAY_MS = 86_400_000;

const EMPTY: FinanceSnapshot = {
  asOf: PERSONA_NOW,
  meId: 'me',
  cash: { available: 0, creditUsed: 0, creditLimit: 0, cardDueDay: null },
  recurring: { rules: [], skips: {} },
  goals: { list: [], savedByGoal: {}, funding: { commitMonthly: 0, fundedThisMonth: 0, remaining: 0, goalsCount: 0 } },
  exposure: { owe: 0, owed: 0, owedExpected: 0, net: 0, owePeople: 0, owedPeople: 0, perPerson: [] },
  receivables: [],
  budgets: [],
  history: [],
  futureOneOffs: [],
};

/** `EVERYDAY_MIN_DAYS` (30) days of trivial Need-category history, so `essentialFloor` clears its own cold-start gate. */
function withNeedHistory(overrides: Partial<FinanceSnapshot>): FinanceSnapshot {
  const history = Array.from({ length: 35 }, (_, i) => ({
    id: `h${i}`, date: PERSONA_NOW - (35 - i) * DAY_MS, kind: 'expense' as const,
    category: 'Groceries', amountPaise: 20_00, isRecurringLinked: false,
  }));
  return { ...EMPTY, history, ...overrides };
}

describe('lowPointWarning', () => {
  it('is silent below the floor\'s own cold-start minimum (no guess with thin data)', () => {
    expect(lowPointWarning(EMPTY)).toBeNull();
  });

  it('is silent when the balance stays comfortably above the floor', () => {
    const snap = withNeedHistory({ cash: { available: 50_00_000, creditUsed: 0, creditLimit: 0, cardDueDay: null } });
    expect(lowPointWarning(snap)).toBeNull();
  });

  it('fires with the date and the biggest event on a real dip, and names it', () => {
    const snap = withNeedHistory({
      cash: { available: 20_000_00, creditUsed: 0, creditLimit: 0, cardDueDay: null },
      futureOneOffs: [{ id: 'f1', date: PERSONA_NOW + 3 * DAY_MS, kind: 'expense', category: 'Rent', amountPaise: 25_000_00 }],
    });
    const w = lowPointWarning(snap);
    expect(w).not.toBeNull();
    // An event dated exactly at day 3's start lands in day 4's bucket — window
    // boundaries are exclusive at the top except the horizon's last day
    // (`projection.ts`'s own convention; matches `engineProjection.test.ts`).
    expect(w!.date).toBe(PERSONA_NOW + 4 * DAY_MS);
    expect(w!.label).toBe('Rent');
    expect(w!.amountPaise).toBeLessThan(0);
  });

  it('never fires past its own 14-day window', () => {
    const snap = withNeedHistory({
      cash: { available: 20_000_00, creditUsed: 0, creditLimit: 0, cardDueDay: null },
      futureOneOffs: [{ id: 'f1', date: PERSONA_NOW + 20 * DAY_MS, kind: 'expense', category: 'Rent', amountPaise: 25_000_00 }],
    });
    expect(lowPointWarning(snap)).toBeNull();
  });

  it.each(PERSONA_KINDS)('runs cleanly against %s without throwing', async (kind) => {
    const db = createTestDb();
    await buildPersona(db, kind);
    const snapshot = await getFinanceSnapshot(db, PERSONA_NOW);
    expect(() => lowPointWarning(snapshot)).not.toThrow();
  });
});
