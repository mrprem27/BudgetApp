import fs from 'fs';
import path from 'path';

/**
 * `sourceCounts.test.ts` holds one number honest — the feature-flag count — because
 * that number drifted three times and a human reading carefully is not a mechanism.
 * Every *other* count in the docs then drifted exactly the same way, unguarded, and
 * got about twice as wrong:
 *
 *   ARCHITECTURE.md      "34 screens"      → 44
 *   FEATURES_AND_FLOWS   "34 route files"  → 44
 *   ARCHITECTURE.md      "lib/ 57 modules" → 111
 *   ARCHITECTURE.md      "queries/ 13"     → 23
 *
 * This is the same mechanism, generalised: any live-doc line that states how many
 * routes / tables / lib modules / query modules / hooks the app has must state the
 * real one. Scan the source, don't trust the prose.
 *
 * A line making a *subset* claim ("12 screens use SheetModal") is not a claim about
 * the total. Gates below are written to skip those; when one is genuinely ambiguous,
 * mark the line `<!--count-ok-->` and it is ignored.
 */

const ROOT = path.resolve(__dirname, '../..');
const DOCS = path.join(ROOT, 'docs');

/** Matches `sourceCounts.test.ts` — dated records must keep saying what they said. */
const HISTORICAL = /^(AUDIT|V2_|DEBT_TRACKER|COMPETITIVE_ANALYSIS)/;

/**
 * Live docs only, and non-recursive on purpose: `docs/history/` is frozen, so a
 * count inside it is evidence of a past state and must not be rewritten to stay green.
 */
function liveDocs(): string[] {
  return fs.readdirSync(DOCS)
    .filter(f => f.endsWith('.md') && !HISTORICAL.test(f))
    .map(f => path.join(DOCS, f))
    .concat([path.join(ROOT, 'AGENTS.md')])
    .filter(f => fs.existsSync(f));
}

function walk(dir: string, keep: (f: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, keep));
    else if (keep(full)) out.push(full);
  }
  return out;
}

const schema = fs.readFileSync(path.join(ROOT, 'src/db/schema.ts'), 'utf8');

/**
 * Real tables only. `IF NOT EXISTS` is what separates the 22 tables the app has from
 * the five scratch tables the rebuild SQL creates (`txn_new`, `category_g`, …) and
 * from the one `-- CREATE TABLE` in a comment.
 */
const TABLE_COUNT = [...schema.matchAll(/^\s*CREATE TABLE IF NOT EXISTS (\w+)/gm)].length;

const ROUTE_COUNT = walk(path.join(ROOT, 'app'), f =>
  f.endsWith('.tsx') && path.basename(f) !== '_layout.tsx').length;

/** Top level only — `ocrProviders/` is a subfolder the docs count separately. */
const LIB_COUNT = fs.readdirSync(path.join(ROOT, 'src/lib')).filter(f => f.endsWith('.ts')).length;
const QUERY_COUNT = fs.readdirSync(path.join(ROOT, 'src/db/queries')).filter(f => f.endsWith('.ts')).length;
const HOOK_COUNT = fs.readdirSync(path.join(ROOT, 'src/hooks')).filter(f => f.endsWith('.ts')).length;

type Subject = {
  what: string;
  count: number;
  /** The line must be talking about this subject at all. Keeps subset claims out. */
  gate: RegExp;
  /** Captures the asserted number. Group 1. */
  claims: RegExp[];
};

const SUBJECTS: Subject[] = [
  {
    what: 'routes',
    count: ROUTE_COUNT,
    // "44 screens" alone is ambiguous; "44 screens under app/" is a total claim.
    gate: /app\/|expo router|\broutes?\b/i,
    claims: [/(\d+)\s+(?:screen\s+)?routes?\b/gi, /(\d+)\s+screens?\b/gi, /routes?\s*\((\d+)\b/gi],
  },
  {
    what: 'tables',
    count: TABLE_COUNT,
    gate: /schema\.ts|CREATE TABLE|\bSQLite\b/i,
    claims: [/(\d+)\s+tables?\b/gi],
  },
  {
    what: 'src/lib modules',
    count: LIB_COUNT,
    gate: /src\/lib|`lib\/`|\blib\/\s/i,
    claims: [/(\d+)\s+modules?\b/gi, /modules?\s*\((\d+)\b/gi],
  },
  {
    what: 'src/db/queries modules',
    count: QUERY_COUNT,
    gate: /queries\//i,
    claims: [/(\d+)\s+(?:query\s+)?(?:modules?|files?)\b/gi],
  },
  {
    what: 'src/hooks',
    count: HOOK_COUNT,
    gate: /src\/hooks|`hooks\/`/i,
    claims: [/(\d+)\s+hooks?\b/gi],
  },
];

describe('documented counts match the source', () => {
  it('finds the source to count (guards against a bad path)', () => {
    expect(TABLE_COUNT).toBeGreaterThan(15);
    expect(ROUTE_COUNT).toBeGreaterThan(20);
    expect(LIB_COUNT).toBeGreaterThan(50);
  });

  it.each(SUBJECTS.map(s => [s.what, s] as const))('states the real number of %s', (_what, subject) => {
    const wrong: string[] = [];
    for (const file of liveDocs()) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (line.includes('<!--count-ok-->')) return;
        if (!subject.gate.test(line)) return;
        // `§10` / `S-41` / `FL-12` are identifiers, not counts.
        const scrubbed = line.replace(/§\s*\d+/g, '').replace(/\b[A-Z]{1,4}-\d+/g, '');
        for (const claim of subject.claims) {
          for (const m of scrubbed.matchAll(claim)) {
            const n = Number(m[1]);
            if (!Number.isFinite(n) || n === subject.count) continue;
            // Two claim patterns can match the same words; report the line once.
            const msg = `${path.relative(ROOT, file)}:${i + 1} says ${n} ${subject.what}, source has ${subject.count}`;
            if (!wrong.includes(msg)) wrong.push(msg);
          }
        }
      });
    }
    expect(wrong).toEqual([]);
  });
});
