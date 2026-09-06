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
  /**
   * The line must be talking about this subject at all, and a claim only counts when
   * it sits within PROXIMITY characters of one of these occurrences.
   *
   * Proximity matters because one line legitimately names two subjects:
   * "`src/db/queries/` (23 modules); pure logic lives in `src/lib/` (111 modules)".
   * A line-level gate lets each subject check the other's number and fails both.
   */
  gate: RegExp;
  /** Captures the asserted number. Group 1. */
  claims: RegExp[];
};

/** Distance from a position to the nearest mention of a subject on the same line. */
function distanceToSubject(line: string, gate: RegExp, at: number): number {
  const g = new RegExp(gate.source, gate.flags.includes('g') ? gate.flags : gate.flags + 'g');
  let best = Infinity;
  for (const m of line.matchAll(g)) best = Math.min(best, Math.abs(m.index! - at));
  return best;
}

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
            // Nearest subject wins. On a line naming two subjects — "`queries/`
            // (23 modules); `src/lib/` (111 modules)" — each number belongs to
            // whichever subject it sits closest to, and to no other.
            const mine = distanceToSubject(scrubbed, subject.gate, m.index!);
            const stolen = SUBJECTS.some(other =>
              other !== subject && distanceToSubject(scrubbed, other.gate, m.index!) < mine);
            if (stolen) continue;
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

/**
 * `SYSTEM.md`'s complexity register groups its entries under headings that count
 * them — "The six that need a decision first", "The four that only look like
 * duplication". Resolving one item means editing a heading, and that went wrong
 * the first time it was tried: `OV-16` was answered, a heading was changed from
 * six to five, and the section underneath still held six — because `OV-16` had
 * never been in that section at all. The register disagreed with itself, in the
 * one document whose job is to be the map.
 *
 * Same principle as the rest of this file: don't trust the prose, count the source.
 * Here the "source" is the register's own entries.
 */
describe('the complexity register agrees with its own headings', () => {
  const WORDS: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  };

  it('has a heading count matching the entries beneath it', () => {
    // FINDINGS.md, not SYSTEM.md: the register moved when nine of them had drifted
    // into contradicting each other, and its DETAIL — the counting headings this
    // check is about — landed here rather than in TRACKER.md. Repointing mattered
    // more than it looks: with no `### The N …` heading left to find, the check
    // below went VACUOUSLY GREEN rather than failing, which is why `headings` is
    // now asserted non-empty first. A guard that passes by reading nothing is worse
    // than no guard, because it also reports success.
    const src = fs.readFileSync(path.join(DOCS, 'FINDINGS.md'), 'utf8');
    // Scoped to the register's own section. Unscoped, this matched prose headings
    // elsewhere in the file ("The three guards…") and demanded OV- entries under
    // them — a guard firing on something it was never about.
    const section = /^## §2 · [\s\S]*?(?=^## §)/m.exec(src);
    expect(section).not.toBeNull();
    const lines = section![0].split('\n');
    const wrong: string[] = [];
    let headings = 0;

    lines.forEach((line, i) => {
      // Deliberately not `The (\w+) that …`: that shape matched only 3 of the
      // register's 6 numbered headings, leaving "The four to actually do", "The
      // seven Walk 1 found" and "The five worth code" unguarded — half the entries.
      const h = /^###\s+The\s+(\w+)\b/.exec(line);
      if (!h) return;
      const claimed = WORDS[h[1].toLowerCase()];
      if (claimed == null) return;
      headings++;

      // Entries run to the next `###`, and each is an id at the start of a line
      // inside the fenced block — `OV-06 · Categories are…`.
      let found = 0;
      for (let k = i + 1; k < lines.length && !/^###\s/.test(lines[k]); k++) {
        if (/^(OV|DQ|E|IV|FE)-\d+\s+·/.test(lines[k])) found++;
      }
      if (found !== claimed) {
        wrong.push(`FINDINGS.md:${i + 1} "${line.trim()}" — ${found} entries beneath it`);
      }
    });

    // The whole point: prove something was counted before believing the count.
    expect(headings).toBeGreaterThan(5);
    expect(wrong).toEqual([]);
  });
});
