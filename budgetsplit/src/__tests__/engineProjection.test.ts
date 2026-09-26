import { getFinanceSnapshot } from '../db/queries/engineSnapshot';
import { getSafeToSpend } from '../db/queries/spendPower';
import { createTestDb } from './helpers/testDb';
import { buildPersona, PERSONA_NOW } from '../db/enginePersonas';
import { projectKnown, knownEvents } from '../lib/engine/projection';
import { safeToSpendV2 } from '../lib/engine/assess';
import { everydayRate } from '../lib/engine/behaviour';

/**
 * E3 first slice + `safeToSpend` v2 (`SPEC-ENGINE.md` §4, task EN2): a
 * deterministic, day-by-day projection replacing the old flat subtraction.
 *
 * The task's own accept criterion: on a ledger with no bills dated inside the
 * horizon, v2 equals today's figure exactly; where they differ, it's because of
 * timing, and the difference names its event.
 */

async function snapshotAndOld(kind: Parameters<typeof buildPersona>[1]) {
  const db = createTestDb();
  await buildPersona(db, kind);
  const snapshot = await getFinanceSnapshot(db, PERSONA_NOW);
  const old = await getSafeToSpend(db, PERSONA_NOW);
  return { snapshot, old };
}

describe('safeToSpendV2 — parity when no bill falls inside the horizon', () => {
  // None of these four has a recurring EXPENSE rule (their only recurring rules,
  // where they have one, are income — allowance/salary — which `upcomingBills`
  // never counted either), and none has a future one-off expense logged ahead.
  it.each(['student', 'freelancer', 'diwaliSpike', 'thinData'] as const)('%s', async kind => {
    const { snapshot, old } = await snapshotAndOld(kind);
    const events = knownEvents(snapshot, snapshot.asOf + 30 * 86_400_000);
    expect(events.filter(e => e.amountPaise < 0 && e.label !== 'Card repayment'
      && e.label !== 'Goal contributions due' && e.label !== 'What I owe')).toEqual([]);

    const v2 = safeToSpendV2(snapshot);
    expect(v2.amount).toBe(old.amount);
    expect(v2.dailyRate).toBe(old.dailyRate);
  });
});

describe('safeToSpendV2 — a bill inside the horizon still names itself', () => {
  it('a bill dated inside the horizon still gives the same headline figure, but the day it lands on names it', async () => {
    const { snapshot, old } = await snapshotAndOld('salariedRenter');
    const v2 = safeToSpendV2(snapshot);

    // With no income modelled yet (the file header explains why), a dated walk
    // and a flat subtraction reach the same total by the horizon's end — moving
    // WHEN a bill is claimed doesn't change WHETHER it's claimed. What's new is
    // that the walk can point at the exact day it happened, which the flat
    // figure never could.
    expect(v2.amount).toBe(old.amount);
    const rentDay = v2.projection.days.find(d => d.events.some(e => /rent/i.test(e.label)));
    expect(rentDay).toBeDefined();
    expect(rentDay!.events.some(e => e.label === 'Rent' && e.amountPaise < 0)).toBe(true);

    // Rent is dated PERSONA_NOW + 1 day (`enginePersonas.ts`) — it must land on
    // day 2 of the walk (day 1 covers `[asOf, asOf+1day)`, exclusive at the top),
    // not merely "some day", which a walk that dumped every event on day 1 would
    // also satisfy.
    const rentIndex = v2.projection.days.findIndex(d => d.events.some(e => e.label === 'Rent'));
    expect(rentIndex).toBe(1); // 0-based: the second day
    expect(v2.projection.days[0].events.some(e => e.label === 'Rent')).toBe(false);
  });

  it('every event in the projection carries a human label, never a bare number', async () => {
    const { snapshot } = await snapshotAndOld('salariedRenter');
    const projection = projectKnown(snapshot);
    const named = projection.days.flatMap(d => d.events);
    expect(named.length).toBeGreaterThan(0);
    for (const e of named) expect(e.label.length).toBeGreaterThan(0);
  });
});

describe('projectKnown', () => {
  it('never claims one event on two different days', async () => {
    const { snapshot } = await snapshotAndOld('salariedRenter');
    const projection = projectKnown(snapshot);
    const seen = new Set<string>();
    for (const day of projection.days) {
      for (const e of day.events) {
        const key = `${e.date}|${e.label}|${e.amountPaise}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it('the low point is the path\'s own minimum, and always the final day with no income modelled', async () => {
    const { snapshot } = await snapshotAndOld('salariedRenter');
    const projection = projectKnown(snapshot);
    const min = Math.min(...projection.days.map(d => d.balance));
    expect(projection.lowPoint.amount).toBe(min);
    expect(projection.lowPoint.date).toBe(projection.days.at(-1)!.date);
  });

  it('is deterministic: the same snapshot projects identically twice', async () => {
    const { snapshot } = await snapshotAndOld('diwaliSpike');
    const a = projectKnown(snapshot);
    const b = projectKnown(snapshot);
    expect(a).toEqual(b);
  });
});

describe('everydayRate', () => {
  it('matches the rate getSafeToSpend computed from the same ledger', async () => {
    const { snapshot, old } = await snapshotAndOld('salariedRenter');
    expect(everydayRate(snapshot)).toBe(old.dailyRate);
  });

  it('is null below 30 days of qualifying history (thin data)', async () => {
    const { snapshot } = await snapshotAndOld('thinData');
    expect(everydayRate(snapshot)).toBeNull();
  });
});
