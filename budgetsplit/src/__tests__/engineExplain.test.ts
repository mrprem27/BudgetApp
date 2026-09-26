import { getFinanceSnapshot } from '../db/queries/engineSnapshot';
import { createTestDb } from './helpers/testDb';
import { buildPersona, PERSONA_NOW } from '../db/enginePersonas';
import { afford } from '../lib/engine/assess';

/** EN7 — confidence + explanation (§4 E6). */

const R = (rupees: number) => Math.round(rupees * 100);

describe('afford — thin data suppresses the verdict, not just its confidence', () => {
  it('the thinData persona (< 30 days of history) gets no verdict and names what\'s missing', async () => {
    const db = createTestDb();
    await buildPersona(db, 'thinData');
    const snap = await getFinanceSnapshot(db, PERSONA_NOW);

    const result = afford(snap, { amountPaise: R(1_000), when: 'now' });
    expect(result.verdict).toBeNull();
    expect(result.explanation.suppressVerdict).toBe(true);
    expect(result.explanation.confidence).toBe('low');
    expect(result.explanation.missing).toBeTruthy();
    expect(result.headline).toContain(result.explanation.missing);
  });

  it('a persona with enough history gets a real verdict', async () => {
    const db = createTestDb();
    await buildPersona(db, 'salariedRenter');
    const snap = await getFinanceSnapshot(db, PERSONA_NOW);

    const result = afford(snap, { amountPaise: R(1_000), when: 'now' });
    expect(result.verdict).not.toBeNull();
    expect(result.explanation.suppressVerdict).toBe(false);
  });
});

describe('afford — every reason renders with only result numbers', () => {
  it('no reason label embeds a raw number — every figure lives in amountPaise instead', async () => {
    const kinds = ['salariedRenter', 'freelancer', 'student', 'diwaliSpike'] as const;
    const amounts = [0, R(1_000), R(50_000), R(500_000)];
    const seen = new Set<string>();
    for (const kind of kinds) {
      const db = createTestDb();
      await buildPersona(db, kind);
      const snap = await getFinanceSnapshot(db, PERSONA_NOW);
      // The boundary amount itself — exactly where `belowFloor` fires — plus
      // the fixed sweep above, so `below_floor` is actually exercised at least
      // once (not just cash_short/comfortable, which the fixed amounts mostly hit).
      const boundary = afford(snap, { amountPaise: 1, when: 'now' }).largestComfortableAmount;
      for (const amountPaise of [...amounts, Math.max(0, boundary) + R(100)]) {
        const result = afford(snap, { amountPaise, when: 'now' });
        for (const reason of result.reasons) {
          seen.add(reason.code);
          expect(reason.label).not.toMatch(/\d/);
          expect(typeof reason.amountPaise).toBe('number');
        }
      }
    }
    expect(seen.has('below_floor')).toBe(true); // proves the sweep actually reached this code path
  });
});
