import type { FinanceSnapshot, Purchase } from '../lib/engine/types';
import { getFinanceSnapshot } from '../db/queries/engineSnapshot';
import { createTestDb } from './helpers/testDb';
import { buildPersona, PERSONA_KINDS, PERSONA_NOW } from '../db/enginePersonas';
import { afford } from '../lib/engine/assess';
import { affordTrace } from '../lib/engine/trace';

/**
 * The Afford screen's "How we got this" panel must never tell a different story
 * from the verdict above it: the checks it shows, read through the rule it
 * shows, land on exactly the engine's own verdict.
 */

const R = (rupees: number) => Math.round(rupees * 100);

async function snapshot(kind: (typeof PERSONA_KINDS)[number]): Promise<FinanceSnapshot> {
  const db = createTestDb();
  await buildPersona(db, kind);
  return getFinanceSnapshot(db, PERSONA_NOW);
}

const LABEL = { 'comfortable': 'Comfortable', 'tight': 'Tight', 'not-affordable': 'Not right now' } as const;

describe('affordTrace', () => {
  it.each(PERSONA_KINDS)('agrees with afford() for %s at every amount', async kind => {
    const snap = await snapshot(kind);
    const purchases: Purchase[] = [R(100), R(5_000), R(40_000), R(300_000)].flatMap(amountPaise => [
      { amountPaise, when: 'now' as const },
      { amountPaise, when: 'can-wait' as const, category: 'Dining', recurrence: 'weekly' as const },
    ]);
    for (const p of purchases) {
      const result = afford(snap, p);
      const trace = affordTrace(snap, p, result);
      const checks = trace.sections.find(s => s.key === 'checks')!.lines;
      const verdict = trace.sections.find(s => s.key === 'verdict')!.lines;

      const implied = checks.some(c => c.status === 'fail') ? 'not-affordable'
        : checks.some(c => c.status === 'warn') ? 'tight' : 'comfortable';
      if (result.verdict == null) {
        expect(verdict.some(l => l.label === 'Verdict held back')).toBe(true);
      } else {
        expect(implied).toBe(result.verdict);
        expect(verdict.find(l => l.label === 'Result')!.value).toBe(LABEL[result.verdict]);
      }

      const low = trace.sections.find(s => s.key === 'low')!.lines;
      expect(low.find(l => l.label === 'Lowest balance with it')!.amountPaise).toBe(result.lowPointAfter.amount);
      expect(low.find(l => l.label === 'Lowest balance without it')!.amountPaise).toBe(result.lowPointBefore.amount);
    }
  });

  it('shows the end-of-window balance as plain arithmetic over the lines above it', async () => {
    const snap = await snapshot('salariedRenter');
    const p: Purchase = { amountPaise: R(2_000), when: 'now' };
    const trace = affordTrace(snap, p, afford(snap, p));
    const flows = trace.sections.find(s => s.key === 'flows')!.lines;
    const end = flows[flows.length - 1];
    const parts = flows.slice(0, -1).reduce((s, l) => s + (l.amountPaise ?? 0), 0);
    expect(end.amountPaise).toBe(snap.cash.available + parts);
  });
});
