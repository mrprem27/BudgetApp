/**
 * The money engine's back-test — `SPEC-ENGINE.md` §8, `EN8`.
 *
 *   npm run engine:backtest
 *
 * Stand at past dates per persona, project forward, compare with what actually
 * happened. Two gates, both hard-fail:
 *
 * 1. **Everyday-spend calibration.** The rate is the engine's only estimate —
 *    bills, card, goals and debts are facts read off the ledger. Predicted
 *    (rate × horizon) vs the real non-recurring my-share spend in the window:
 *    every run within ±`MAX_RATE_ERROR`.
 * 2. **No false "Not affordable".** The cash forecast (bills + everyday +
 *    income) says the balance goes below zero; reality says it never did.
 *    Must be zero.
 *
 * What the stand-point snapshot drops, and why (both were contaminating the
 * first version of this test, and very likely L7's original evidence too):
 * - `futureOneOffs`. A snapshot taken "as of" a past date still sees every row
 *   dated after it — the db has no record of *when* a row was entered — so the
 *   real future spend leaked in as pre-logged bills, on top of the rate.
 * - The three reservations (card balance, goal contributions, what I owe).
 *   Safe-to-Spend sets that money aside on purpose; the fixtures never pay
 *   the card or fund a goal, so reality keeps it. That's policy, not a
 *   prediction, and there's nothing to calibrate.
 *
 * Swap `buildPersona` for a loader on a real exported ledger to run it on
 * real data — nothing else here assumes a fixture.
 */
import { createTestDb } from './helpers/testDb';
import { buildPersona, PERSONA_KINDS, PERSONA_NOW, type PersonaKind } from '../db/enginePersonas';
import { getFinanceSnapshot } from '../db/queries/engineSnapshot';
import { getCashPosition } from '../db/queries/savings';
import { projectKnown } from '../lib/engine/projection';
import { everydayRate } from '../lib/engine/behaviour';
import type { FinanceSnapshot } from '../lib/engine/types';
import { STS_HORIZON_DAYS } from '../lib/safeToSpend';
import { formatRupees } from '../lib/money';

const DAY_MS = 86_400_000;
const STAND_BACK_DAYS = [90, 75, 60, 45, 30];
const HORIZON = STS_HORIZON_DAYS;
/** ±25%: today's worst run is 13%; a rate twice or half the truth fails loudly. */
const MAX_RATE_ERROR = 0.25;

type Run = {
  persona: PersonaKind;
  standAtMs: number;
  predictedSpend: number;
  actualSpend: number;
  rateError: number;
  predictedLow: number;
  actualLow: number;
  falseNotAffordable: boolean;
};

/** The forecast half only: no leaked future rows, no reservations. */
function forecastOnly(s: FinanceSnapshot): FinanceSnapshot {
  return {
    ...s,
    futureOneOffs: [],
    cash: { ...s.cash, creditUsed: 0 },
    goals: { ...s.goals, funding: { ...s.goals.funding, remaining: 0 } },
    exposure: { ...s.exposure, owe: 0 },
  };
}

async function backtestPersona(kind: PersonaKind): Promise<Run[]> {
  const db = createTestDb();
  await buildPersona(db, kind);
  const runs: Run[] = [];

  for (const back of STAND_BACK_DAYS) {
    const standAtMs = PERSONA_NOW - back * DAY_MS;
    const endMs = standAtMs + HORIZON * DAY_MS;
    if (endMs > PERSONA_NOW) continue;

    const snapshot = await getFinanceSnapshot(db, standAtMs);
    const rate = everydayRate(snapshot);
    if (rate == null) continue; // below the rate's own minimum — nothing claimed, nothing to check

    const later = await getFinanceSnapshot(db, endMs);
    const actualSpend = later.history
      .filter(h => h.kind === 'expense' && !h.isRecurringLinked && h.date > standAtMs && h.date <= endMs)
      .reduce((s, h) => s + h.amountPaise, 0);
    const predictedSpend = rate * HORIZON;

    const predictedLow = projectKnown(forecastOnly(snapshot), HORIZON, [], true).lowPoint.amount;
    let actualLow = Infinity;
    for (let d = standAtMs; d <= endMs; d += DAY_MS) {
      actualLow = Math.min(actualLow, (await getCashPosition(db, undefined, d)).available);
    }

    runs.push({
      persona: kind, standAtMs, predictedSpend, actualSpend,
      rateError: actualSpend > 0 ? (predictedSpend - actualSpend) / actualSpend : 0,
      predictedLow, actualLow,
      falseNotAffordable: predictedLow < 0 && actualLow >= 0,
    });
  }
  return runs;
}

const pct = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`;

describe('engine back-test (SPEC-ENGINE.md §8)', () => {
  let runs: Run[] = [];

  beforeAll(async () => {
    for (const kind of PERSONA_KINDS) runs.push(...(await backtestPersona(kind)));

    const rows = runs.map(r =>
      `${r.persona.padEnd(15)} ${new Date(r.standAtMs).toISOString().slice(0, 10)}  `
      + `spend ${formatRupees(r.predictedSpend).padStart(11)} vs ${formatRupees(r.actualSpend).padStart(11)} ${pct(r.rateError).padStart(5)}   `
      + `low ${formatRupees(r.predictedLow).padStart(13)} vs ${formatRupees(r.actualLow).padStart(13)}`
      + (r.falseNotAffordable ? '  ⚠ FALSE NOT-AFFORDABLE' : ''),
    );
    const worst = Math.max(0, ...runs.map(r => Math.abs(r.rateError)));
    console.log([
      `\nMoney engine back-test — ${runs.length} runs, ${HORIZON}-day horizon (predicted vs actual)\n`,
      ...rows,
      `\nWorst everyday-spend error: ${pct(worst)} (gate ±${MAX_RATE_ERROR * 100}%)`,
      `False "Not affordable": ${runs.filter(r => r.falseNotAffordable).length} (gate 0)\n`,
    ].join('\n'));
  });

  it('ran on enough windows to mean something', () => {
    expect(runs.length).toBeGreaterThanOrEqual(8);
  });

  it('everyday spend is predicted within ±25% on every window', () => {
    const off = runs.filter(r => Math.abs(r.rateError) > MAX_RATE_ERROR);
    expect(off.map(r => `${r.persona} ${pct(r.rateError)}`)).toEqual([]);
  });

  it('never predicts a shortfall that never happened', () => {
    expect(runs.filter(r => r.falseNotAffordable).map(r => r.persona)).toEqual([]);
  });
});
