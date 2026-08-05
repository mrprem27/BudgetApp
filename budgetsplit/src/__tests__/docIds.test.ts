import fs from 'fs';
import path from 'path';

/**
 * Every `V2-nn` cited anywhere in docs/ must be *defined* in the review.
 *
 * `V2-29` … `V2-33` were cited about fifteen times in `V2_FIX_PLAN.md` while being defined nowhere
 * at all — IDs assigned mid-execution that never made it back into the document they pointed at.
 * That is the same class of drift `sourceCounts.test.ts` catches for numbers and
 * `docCoverage.test.ts` catches for routes, and it went unnoticed for three waves because nothing
 * read it.
 *
 * Note the deliberate difference from `sourceCounts.test.ts`: that test skips historical docs,
 * because a dated finding is *supposed* to keep saying "19 flags". This one skips nothing. A
 * dangling ID is wrong in a historical document too — arguably more so, since that is where a
 * reader goes looking for the definition.
 */

const ROOT = path.resolve(__dirname, '../..');
const DOCS = path.join(ROOT, 'docs');
const REVIEW = path.join(DOCS, 'V2_PRODUCT_REVIEW.md');

const CITATION = /\bV2-(\d+)\b/g;

function docFiles(): string[] {
  return fs.readdirSync(DOCS).filter(f => f.endsWith('.md')).map(f => path.join(DOCS, f));
}

/**
 * An ID counts as defined when the review gives it a findings-table row (`| **V2-07** |`) or a
 * heading. Bare prose mentions do not count — a cross-reference is not a definition, which is
 * exactly how the orphans stayed invisible.
 */
function definedIds(): Set<string> {
  const review = fs.readFileSync(REVIEW, 'utf8');
  const out = new Set<string>();
  for (const m of review.matchAll(/^\s*(?:\|\s*)?\*\*`?(V2-\d+)`?\*\*\s*\|/gm)) out.add(m[1]);
  for (const m of review.matchAll(/^#{2,4}\s+.*?\b(V2-\d+)\b/gm)) out.add(m[1]);
  return out;
}

describe('every cited V2 finding has a definition', () => {
  it('leaves no dangling ID anywhere in docs/', () => {
    const defined = definedIds();
    const orphans: string[] = [];

    for (const file of docFiles()) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const m of line.matchAll(CITATION)) {
          if (defined.has(m[0])) continue;
          orphans.push(`${path.relative(ROOT, file)}:${i + 1} cites ${m[0]}, which the review never defines`);
        }
      });
    }

    // Report all of them, not just the first — a half-fixed docset is its own trap.
    expect(orphans).toEqual([]);
  });

  it('actually found the definitions, rather than passing on an empty set', () => {
    // Guards the guard: a regex that silently matched nothing would make the test above
    // vacuously true and every orphan invisible.
    const defined = definedIds();
    expect(defined.size).toBeGreaterThanOrEqual(30);
    expect(defined.has('V2-01')).toBe(true);
    expect(defined.has('V2-36')).toBe(true);
  });
});
