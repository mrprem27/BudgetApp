import type { FinanceSnapshot } from '../lib/engine/types';
import { getFinanceSnapshot } from '../db/queries/engineSnapshot';
import { createTestDb } from './helpers/testDb';
import { buildPersona, PERSONA_NOW } from '../db/enginePersonas';
import { projectBand, projectKnown } from '../lib/engine/projection';
import { everydayRate } from '../lib/engine/behaviour';

/**
 * E3's uncertainty band (`SPEC-ENGINE.md` §4, task EN3): a 500-path 7-day
 * block bootstrap around the deterministic path, seeded from the snapshot
 * itself so it's reproducible.
 */

const DAY_MS = 86_400_000;
const R = (rupees: number) => Math.round(rupees * 100);

const EMPTY: FinanceSnapshot = {
  asOf: 0,
  meId: 'me',
  cash: { available: R(100_000), creditUsed: 0, creditLimit: 0, cardDueDay: null },
  recurring: { rules: [], skips: {} },
  goals: { list: [], savedByGoal: {}, funding: { commitMonthly: 0, fundedThisMonth: 0, remaining: 0, goalsCount: 0 } },
  exposure: { owe: 0, owed: 0, owedExpected: 0, net: 0, owePeople: 0, owedPeople: 0, perPerson: [] },
  receivables: [],
  budgets: [],
  history: [],
  futureOneOffs: [],
};

/** A snapshot with `days.length` days of daily-spend history, one entry per
 *  day, ending the day before `asOf` — all in one Want category, so the
 *  essential floor stays 0 and only the band itself is under test. */
function withDailySpend(asOf: number, amounts: number[]): FinanceSnapshot {
  const history = amounts.map((amt, i) => ({
    id: `h${i}`,
    date: asOf - (amounts.length - i) * DAY_MS + 12 * 3_600_000,
    kind: 'expense' as const,
    category: 'Shopping',
    amountPaise: amt,
    isRecurringLinked: false,
  }));
  return { ...EMPTY, asOf, history };
}

describe('projectBand — thin data collapses onto the known path', () => {
  it('no history at all: the band is degenerate and matches projectKnown exactly', () => {
    const snapshot = withDailySpend(PERSONA_NOW, []);
    expect(everydayRate(snapshot)).toBeNull();

    const known = projectKnown(snapshot);
    const band = projectBand(snapshot);

    expect(band.paths).toBe(0);
    expect(band.cautiousLowPoint).toBe(known.lowPoint.amount);
    expect(band.days).toHaveLength(known.days.length);
    for (let i = 0; i < band.days.length; i++) {
      expect(band.days[i].p10).toBe(known.days[i].balance);
      expect(band.days[i].p50).toBe(known.days[i].balance);
      expect(band.days[i].p90).toBe(known.days[i].balance);
    }
  });

  it('a real thin-data persona (< 30 qualifying days) collapses the same way', async () => {
    const db = createTestDb();
    await buildPersona(db, 'thinData');
    const snapshot = await getFinanceSnapshot(db, PERSONA_NOW);
    expect(everydayRate(snapshot)).toBeNull();

    const known = projectKnown(snapshot);
    const band = projectBand(snapshot);
    expect(band.paths).toBe(0);
    expect(band.cautiousLowPoint).toBe(known.lowPoint.amount);
  });
});

describe('projectBand — determinism', () => {
  it('the same snapshot simulates identically twice', async () => {
    const db = createTestDb();
    await buildPersona(db, 'salariedRenter');
    const snapshot = await getFinanceSnapshot(db, PERSONA_NOW);
    const a = projectBand(snapshot);
    const b = projectBand(snapshot);
    expect(a).toEqual(b);
  });
});

describe('projectBand — the cautious low point falls as everyday-spend variance rises', () => {
  it('same mean daily spend, higher variance ⇒ a lower (worse) P20 low point', () => {
    const days = 90;
    const meanPaise = R(500);
    const steady = new Array(days).fill(meanPaise);
    // Same total (and therefore ~same mean) as `steady`, spread across two
    // extremes instead — a much higher day-to-day variance for the bootstrap
    // to pick up on.
    const volatile = steady.map((_, i) => (i % 2 === 0 ? 0 : meanPaise * 2));

    const steadyBand = projectBand(withDailySpend(PERSONA_NOW, steady));
    const volatileBand = projectBand(withDailySpend(PERSONA_NOW, volatile));

    expect(steadyBand.paths).toBe(500);
    expect(volatileBand.paths).toBe(500);
    expect(volatileBand.cautiousLowPoint).toBeLessThan(steadyBand.cautiousLowPoint);
  });
});

describe('projectBand — performance', () => {
  it('500 paths over a year run well under budget', () => {
    const days = new Array(400).fill(R(500)).map((amt, i) => Math.round(amt * (i % 2 === 0 ? 0.7 : 1.3)));
    const snapshot = withDailySpend(PERSONA_NOW, days);
    const start = Date.now();
    projectBand(snapshot, 365, 500);
    const elapsed = Date.now() - start;
    // Spec target (§4 E3) is 100 ms for 500 paths × 60 days in its own test
    // environment; this is a full year (365 days) with generous CI headroom.
    expect(elapsed).toBeLessThan(500);
  });
});
