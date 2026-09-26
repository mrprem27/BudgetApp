import type { FinanceSnapshot } from '../lib/engine/types';
import { getFinanceSnapshot } from '../db/queries/engineSnapshot';
import { createTestDb } from './helpers/testDb';
import { buildPersona, PERSONA_NOW } from '../db/enginePersonas';
import { horizonDaysFor, projectKnown, knownEvents } from '../lib/engine/projection';
import { repaymentModel, incomeModel } from '../lib/engine/behaviour';
import { afford } from '../lib/engine/assess';

/**
 * `EN5` — income (§4 E2's income row, §4 E3's income known event, the payday
 * safety horizon) and receivables (Beta-binomial repayment, §4 E2; the
 * uncertain arrival, §4 E3).
 *
 * `withIncome` is opt-in everywhere (`projection.ts`'s file header) — none of
 * this fires unless a caller explicitly asks for it, which is what keeps
 * every EN1–EN4 test passing unchanged.
 */

const DAY_MS = 86_400_000;
const R = (rupees: number) => Math.round(rupees * 100);

async function snapshot(kind: Parameters<typeof buildPersona>[1]): Promise<FinanceSnapshot> {
  const db = createTestDb();
  await buildPersona(db, kind);
  return getFinanceSnapshot(db, PERSONA_NOW);
}

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

describe('horizonDaysFor — the payday horizon', () => {
  it('extends past 30 days to cover a payday further out, at least 30 regardless', async () => {
    const farPayday: FinanceSnapshot = {
      ...EMPTY,
      recurring: {
        rules: [{
          id: 'salary-rule', group_id: 'g', kind: 'income', entry_mode: 'quick',
          date: PERSONA_NOW - 5 * DAY_MS, category: 'Salary', recur_freq: 'monthly',
          is_deleted: 0, pendingApproval: false,
          payments: [{ personId: 'me', amount: R(50_000) }], shares: [],
        } as unknown as FinanceSnapshot['recurring']['rules'][number]],
        skips: {},
      },
    };
    const horizon = horizonDaysFor(farPayday);
    const income = incomeModel(farPayday);
    expect(income.consistency).toBe('regular');
    expect(income.nextDate).not.toBeNull();
    const daysUntil = Math.ceil((income.nextDate! - farPayday.asOf) / DAY_MS);
    expect(horizon).toBeGreaterThanOrEqual(daysUntil);
    expect(horizon).toBeGreaterThanOrEqual(30);
  });

  it('never shrinks below 30, even when payday is tomorrow', async () => {
    const snap = await snapshot('salariedRenter'); // rent/salary both land within days
    expect(horizonDaysFor(snap)).toBeGreaterThanOrEqual(30);
  });
});

describe('horizonDaysFor — irregular income gets 60 days ("freelancer 60 d")', () => {
  it('the freelancer persona (no rule, high month-to-month variance) reads irregular and gets a 60-day floor', async () => {
    const snap = await snapshot('freelancer');
    const income = incomeModel(snap);
    expect(income.consistency).toBe('irregular');
    expect(horizonDaysFor(snap)).toBeGreaterThanOrEqual(60);
  });
});

describe('repaymentModel — a friend with no settlement history gets exactly the prior', () => {
  it('Beta(1,2): probability is exactly 1/3 with no history', () => {
    const snap: FinanceSnapshot = { ...EMPTY, receivables: [{ personId: 'aarav', settlements: [] }] };
    const model = repaymentModel(snap, 'aarav');
    expect(model.probability).toBeCloseTo(1 / 3, 10);
    expect(model.delayDays).toBe(30);
  });

  it('a person with no receivables entry at all also reads the same prior', () => {
    const model = repaymentModel(EMPTY, 'nobody');
    expect(model.probability).toBeCloseTo(1 / 3, 10);
  });

  it('more past settlements raise the probability above the prior', () => {
    const snap: FinanceSnapshot = {
      ...EMPTY,
      receivables: [{
        personId: 'aarav',
        settlements: [
          { date: PERSONA_NOW - 90 * DAY_MS, amountPaise: R(1_000) },
          { date: PERSONA_NOW - 60 * DAY_MS, amountPaise: R(1_000) },
          { date: PERSONA_NOW - 30 * DAY_MS, amountPaise: R(1_000) },
        ],
      }],
    };
    const model = repaymentModel(snap, 'aarav');
    expect(model.probability).toBeGreaterThan(1 / 3);
    expect(model.delayDays).toBe(30); // exact median gap in this fixture
  });
});

describe('knownEvents — income only appears when withIncome is set', () => {
  it('a regular income rule contributes nothing by default, and an event once opted in', async () => {
    const snap = await snapshot('salariedRenter');
    const horizonEndMs = snap.asOf + 30 * DAY_MS;
    const without = knownEvents(snap, horizonEndMs);
    const withIncome = knownEvents(snap, horizonEndMs, true);
    expect(without.some(e => e.label === 'Income')).toBe(false);
    expect(withIncome.some(e => e.label === 'Income')).toBe(true);
    expect(withIncome.find(e => e.label === 'Income')!.amountPaise).toBeGreaterThan(0);
  });
});

describe('projectKnown — a payday can raise the balance mid-horizon once opted in', () => {
  it('the low point is no longer necessarily the final day', async () => {
    const snap = await snapshot('salariedRenter');
    const withIncome = projectKnown(snap, 30, [], true);
    const risingDay = withIncome.days.find(d => d.events.some(e => e.label === 'Income'));
    expect(risingDay).toBeDefined();
    // A real rise happened somewhere: some day's balance exceeds the previous day's.
    const rose = withIncome.days.some((d, i) => i > 0 && d.balance > withIncome.days[i - 1].balance);
    expect(rose).toBe(true);
  });
});

describe('afford — a tipping receivable is named', () => {
  it('names the person whose expected payment alone would close the gap to the floor', () => {
    // A bill lands on day 25, which would otherwise crash the balance below
    // the floor. Aarav's ₹10,000 (his own past settlements 10 days apart, so
    // `repaymentModel` reads a 10-day delay) arrives on day 10 — well before
    // the bill — and is large enough to absorb it.
    const snap: FinanceSnapshot = {
      ...EMPTY,
      cash: { available: R(1_000), creditUsed: 0, creditLimit: 0, cardDueDay: null },
      exposure: {
        owe: 0, owed: R(10_000), owedExpected: 0, net: R(10_000), owePeople: 0, owedPeople: 1,
        perPerson: [{ personId: 'aarav', name: 'Aarav', avatarColor: '#fff', imageUri: null, net: R(10_000), groupCount: 1, receivableState: 'unset' }],
      },
      receivables: [{
        personId: 'aarav',
        settlements: [
          { date: PERSONA_NOW - 40 * DAY_MS, amountPaise: R(3_000) },
          { date: PERSONA_NOW - 30 * DAY_MS, amountPaise: R(3_000) },
        ],
      }],
      futureOneOffs: [{ id: 'bill1', date: PERSONA_NOW + 25 * DAY_MS, kind: 'expense', category: 'Bills', amountPaise: R(5_000) }],
    };
    expect(repaymentModel(snap, 'aarav').delayDays).toBe(10);

    const withoutReceivable = afford(snap, { amountPaise: R(500), when: 'now' }, 30, false);
    expect(withoutReceivable.verdict).not.toBe('comfortable');

    const result = afford(snap, { amountPaise: R(500), when: 'now' }, 30, true);
    expect(result.tippingReceivables.length).toBeGreaterThan(0);
    expect(result.tippingReceivables[0].personId).toBe('aarav');
    expect(result.tippingReceivables[0].amountPaise).toBe(R(10_000));
    expect(result.tippingReceivables[0].delayDays).toBe(10);
  });

  it('names nothing when there is no receivable to name, or the purchase is already Comfortable', () => {
    const richSnap: FinanceSnapshot = { ...EMPTY, cash: { available: R(1_000_000), creditUsed: 0, creditLimit: 0, cardDueDay: null } };
    expect(afford(richSnap, { amountPaise: R(500), when: 'now' }, 30, true).tippingReceivables).toEqual([]);
  });
});

describe('repaymentModel never syncs', () => {
  it('is exported only from lib/engine — nothing under db/queries, lib/sync or server may import it', () => {
    // See repaymentNeverSyncs.test.ts for the real source-scanning guard; this
    // is a same-file sanity pin that the export exists where the guard expects it.
    expect(typeof repaymentModel).toBe('function');
  });
});
