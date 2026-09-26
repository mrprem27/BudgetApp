import { createTestDb } from './helpers/testDb';
import { buildPersona, PERSONA_KINDS, PERSONA_NOW } from '../db/enginePersonas';
import { getSafeToSpend, getSafeToSpendV2 } from '../db/queries/spendPower';

/**
 * `EN10` — Home's Safe-to-Spend switched from `getSafeToSpend` (the arithmetic
 * formula) to `getSafeToSpendV2` (the money engine). This is the parity check
 * that switch rests on: not just the headline `amount` (already covered by
 * `useEngineDevComparison`'s dev screen), but every breakdown field the sheet
 * still shows — those are re-derived from the engine's own known events by
 * label (`projection.ts`'s `knownEvents()`), a different code path than the
 * one that used to compute them, so a label typo or a miscategorized event
 * would show up here as a parts mismatch even while the total still matched.
 */
describe('getSafeToSpendV2 — parity with getSafeToSpend (EN10)', () => {
  it.each(PERSONA_KINDS)('matches the old formula exactly on every field, on %s', async (kind) => {
    const db = createTestDb();
    await buildPersona(db, kind);

    const old = await getSafeToSpend(db, PERSONA_NOW);
    const v2 = await getSafeToSpendV2(db, PERSONA_NOW);

    expect(v2.available).toBe(old.available);
    expect(v2.upcomingBills).toBe(old.upcomingBills);
    expect(v2.cardRepayment).toBe(old.cardRepayment);
    expect(v2.goalRemaining).toBe(old.goalRemaining);
    expect(v2.netIOwe).toBe(old.netIOwe);
    expect(v2.everydaySpend).toBe(old.everydaySpend);
    expect(v2.amount).toBe(old.amount);
    expect(v2.dailyRate).toBe(old.dailyRate);
  });

  it('reports zeros, not a throw, with no signed-in user', async () => {
    const db = createTestDb();
    const v2 = await getSafeToSpendV2(db, PERSONA_NOW);
    expect(v2.amount).toBe(0);
    expect(v2.available).toBe(0);
  });
});
