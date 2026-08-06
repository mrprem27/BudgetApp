import fs from 'fs';
import path from 'path';
import { DEFAULTS } from '../lib/featureFlags';

/**
 * V2-14: the documented flag count drifted three separate times — the docs said 12
 * while the source said 14, and before that 19 → 12. Every drift was caught by a
 * human reading carefully, which is not a mechanism.
 *
 * This is the mechanism. Any doc line that states a flag count must state the real
 * one, so changing `FeatureKey` fails the suite until the docs follow. Same
 * precedent as `docCoverage.test.ts` (routes) and `featureFlags.test.ts` (dead
 * flags): scan the source, don't trust the prose.
 */

const ROOT = path.resolve(__dirname, '../..');
const DOCS = path.join(ROOT, 'docs');

const FLAG_COUNT = Object.keys(DEFAULTS).length;

/**
 * Docs that describe the app as it is now. `AUDIT*.md`, `V2_*.md` and `DEBT_TRACKER`
 * are excluded on purpose: they are dated records of a past state, and a finding
 * that says "19 flags gate nothing" is *supposed* to keep saying 19. Rewriting
 * history to keep a test green would destroy the only evidence of what was fixed.
 */
const HISTORICAL = /^(AUDIT|V2_|DEBT_TRACKER|COMPETITIVE_ANALYSIS)/;

function liveDocs(): string[] {
  return fs.readdirSync(DOCS)
    .filter(f => f.endsWith('.md') && !HISTORICAL.test(f))
    .map(f => path.join(DOCS, f))
    .concat([path.join(ROOT, 'AGENTS.md')])
    .filter(f => fs.existsSync(f));
}

/** "12 feature flags", "FeatureKey now holds 12", "✓ 12 keys, all gating". */
const CLAIM = /(\d+)\s+(?:feature[- ]flags?|flags?\b|keys?\b)|(?:FeatureKey|flag set)[^.\n]*?\b(\d+)\b/gi;

describe('documented flag count matches the source', () => {
  it('states the real number wherever it states a number at all', () => {
    const wrong: string[] = [];
    for (const file of liveDocs()) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        // Only lines actually talking about feature flags — "12 keys" in a table of
        // DB columns is not a claim about this.
        if (!/feature[- ]flag|FeatureKey|flag table|gating/i.test(line)) return;
        // `§10 Feature flags` is a section reference, not a count.
        for (const m of line.replace(/§\s*\d+/g, '').matchAll(CLAIM)) {
          const n = Number(m[1] ?? m[2]);
          if (!Number.isFinite(n) || n === FLAG_COUNT) continue;
          wrong.push(`${path.relative(ROOT, file)}:${i + 1} says ${n}, source has ${FLAG_COUNT}`);
        }
      });
    }
    expect(wrong).toEqual([]);
  });
});

/**
 * V2-21: `review.tsx` is the largest screen in the app and has been "decompose it
 * later" in three separate documents (F-18, S-19, DEBT-11). A ceiling doesn't pay
 * that debt down — it stops it growing, which is the part vigilance keeps failing.
 *
 * The number is the count at the time of writing (as `split('\n')` counts it — one
 * more than `wc -l`, which ignores the trailing newline). Lower it when you decompose;
 * never raise it. If a change genuinely needs more lines, extract something first.
 */
describe('screen size ceilings', () => {
  const CEILINGS: Record<string, number> = {
    'app/review.tsx': 1021,
  };

  for (const [rel, ceiling] of Object.entries(CEILINGS)) {
    it(`${rel} stays at or under ${ceiling} lines`, () => {
      const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').length;
      expect(lines).toBeLessThanOrEqual(ceiling);
    });
  }
});
