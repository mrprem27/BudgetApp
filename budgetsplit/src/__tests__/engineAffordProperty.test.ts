import fs from 'fs';
import path from 'path';
import { ROOT, walk } from './helpers/systemDoc';
import { afford, safeToSpendV2 } from '../lib/engine/assess';
import { buildPersona, PERSONA_KINDS, PERSONA_NOW } from '../db/enginePersonas';
import { createTestDb } from './helpers/testDb';
import { getFinanceSnapshot } from '../db/queries/engineSnapshot';

/**
 * `EN11`'s two accept criteria (`SPEC-ENGINE.md` §1, "success means").
 */

describe('no evaluateAfford caller remains (EN11 guard)', () => {
  it('lib/afford.ts is gone and nothing imports it', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/lib/afford.ts'))).toBe(false);
    const files = walk(path.join(ROOT, 'src'), f => f.endsWith('.ts') || f.endsWith('.tsx'))
      .concat(walk(path.join(ROOT, 'app'), f => f.endsWith('.ts') || f.endsWith('.tsx')));
    const offenders = files
      .filter(f => path.basename(f) !== 'engineAffordProperty.test.ts')
      .filter(f => /(?:from\s+['"][^'"]*lib\/afford['"]|evaluateAfford)/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map(f => path.relative(ROOT, f))).toEqual([]);
  });
});

describe('Afford and Safe-to-Spend cannot disagree (SPEC-ENGINE.md §1)', () => {
  it.each(PERSONA_KINDS)('Not affordable exactly when the amount exceeds Safe-to-Spend, on %s', async (kind) => {
    const db = createTestDb();
    await buildPersona(db, kind);
    const snapshot = await getFinanceSnapshot(db, PERSONA_NOW);
    const sts = safeToSpendV2(snapshot).amount;

    // Sweep amounts either side of the boundary — the one place a fencepost
    // error would actually show up — plus a spread further out.
    const amounts = [0, sts - 5000, sts - 1, sts, sts + 1, sts + 5000, sts + 500_000].filter(a => a >= 0);
    for (const amountPaise of amounts) {
      const result = afford(snapshot, { amountPaise, when: 'now' });
      if (result.verdict == null) continue; // thin-data personas suppress the verdict entirely — nothing to check
      expect(result.verdict === 'not-affordable').toBe(amountPaise > sts);
    }
  });
});
