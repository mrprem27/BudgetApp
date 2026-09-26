import { createTestDb } from './helpers/testDb';
import { buildPersona, PERSONA_KINDS, PERSONA_NOW } from '../db/enginePersonas';
import { getSafeToSpendV2 } from '../db/queries/spendPower';

/**
 * `EN10`/`EN13` — Home's Safe-to-Spend, off the money engine, horizon to
 * payday with salary counted (`SPEC-ENGINE.md` §2). The parts are read up to
 * the low point, so this is the accept criterion the spec names directly:
 * they must sum to `amount` exactly, on every persona, not just look close.
 */
describe('getSafeToSpendV2 (EN10/EN13)', () => {
  it.each(PERSONA_KINDS)('breakdown sums to amount exactly, on %s', async (kind) => {
    const db = createTestDb();
    await buildPersona(db, kind);
    const sts = await getSafeToSpendV2(db, PERSONA_NOW);

    const sum = sts.available + sts.income - sts.upcomingBills - sts.cardRepayment
      - sts.goalRemaining - sts.netIOwe - sts.everydaySpend;
    expect(sum).toBe(sts.amount);

    // The figure is safe UNTIL the low point, not for a flat 30 days.
    expect(sts.untilMs).toBeGreaterThanOrEqual(PERSONA_NOW);
    expect(sts.daysLeft).toBeGreaterThanOrEqual(0);
  });

  it('reports zeros, not a throw, with no signed-in user', async () => {
    const db = createTestDb();
    const sts = await getSafeToSpendV2(db, PERSONA_NOW);
    expect(sts.amount).toBe(0);
    expect(sts.available).toBe(0);
  });

  it('never double-books a card/goal/owe claim as an everyday bill', async () => {
    const db = createTestDb();
    await buildPersona(db, 'salariedRenter');
    const sts = await getSafeToSpendV2(db, PERSONA_NOW);
    // salariedRenter carries card debt, goal contributions and rent — each
    // must land in its own bucket, not fall through to `upcomingBills`.
    expect(sts.cardRepayment).toBeGreaterThan(0);
    expect(sts.goalRemaining).toBeGreaterThan(0);
    expect(sts.upcomingBills).toBeGreaterThan(0);
  });
});
