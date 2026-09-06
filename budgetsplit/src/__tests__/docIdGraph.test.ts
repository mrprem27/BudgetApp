import fs from 'fs';
import path from 'path';
import { ROOT, doc, tracker, testFileNames } from './helpers/systemDoc';

/**
 * Two things, both about a document pointing at something that is not there.
 *
 * 1. Every id cited in `SYSTEM.md` resolves to a definition. This is what makes
 *    "file an issue against FL-06.E7" durable: the prose under an id may change, but
 *    a citation must never point at nothing. Generalises `docIds.test.ts`, which
 *    does exactly this for `V2-` alone, to all nine namespaces.
 *
 * 2. Every `*.test.ts` a live doc names actually exists. SYSTEM.md shipped naming
 *    six guard files that did not exist — the checks were real but lived together in
 *    one file, so the document confidently cited six paths you could not run. That
 *    is the drift this document exists to end, committed inside the mechanism meant
 *    to prevent it, and nothing caught it because nothing was looking.
 */

const defined = new Set<string>();

/**
 * Definitions come from every live register, not just `SYSTEM.md`. `OV-` and `DQ-`
 * moved to `TRACKER.md`, which owns every open finding; `MW-` has always been
 * defined in `SYNC-MODEL.md` Part 4, where it labels the rows of the "who can change
 * your numbers" table so other documents can point at one. Reading a single file
 * would dangle 89 ids the day the split landed, which is the failure this exists for.
 */
const REGISTERS = [
  doc,
  tracker,
  fs.readFileSync(path.join(ROOT, 'docs/SYNC-MODEL.md'), 'utf8'),
];

for (const src of REGISTERS) {
  // `### E-04 · …`, `### FL-04 · …`, `### SN-04 · …`
  for (const m of src.matchAll(/^### ((?:E|FL|SN)-\d+[a-z]?) ·/gm)) defined.add(m[1]);
  // Table rows: `| \`AX-01\` | …`
  for (const m of src.matchAll(/^\| `((?:AX|IV|FE|SC|DQ|SN|W1|MW)-\d+[a-z]?)` \|/gm)) defined.add(m[1]);
  // `| \`SYNC-F13\` | …` — the sync register's own row shape.
  for (const m of src.matchAll(/^\| `(SYNC-F\d+)`[^|]* \|/gm)) defined.add(m[1]);
  // The flag table carries its feature id in a later column.
  for (const m of src.matchAll(/^\| \d+ \| `\w+` \|.*?`(FE-\d+)`.*\|$/gm)) defined.add(m[1]);
  // Fenced definitions: `OV-12 · …`, `FL-21 · …`, `SN-09  T0 …`
  for (const m of src.matchAll(/^((?:OV|FL)-\d+) · /gm)) defined.add(m[1]);
  for (const m of src.matchAll(/^(SN-\d+)\s+T0/gm)) defined.add(m[1]);
}
// A list of cases exists for every task, by §9's coverage rule — that IS its definition.
for (const id of [...defined]) if (id.startsWith('FL-')) defined.add(id.replace('FL-', 'SN-'));

/** Live docs only: a frozen record may cite a test that has since been renamed. */
const HISTORICAL = /^(AUDIT|V2_|DEBT_TRACKER|COMPETITIVE_ANALYSIS)/;
function liveDocs(): string[] {
  const DOCS = path.join(ROOT, 'docs');
  return fs.readdirSync(DOCS)
    .filter(f => f.endsWith('.md') && !HISTORICAL.test(f))
    .map(f => path.join(DOCS, f))
    .concat([path.join(ROOT, 'AGENTS.md')])
    .filter(f => fs.existsSync(f));
}

const NAMESPACES = /`((?:E|AX|IV|FE|SC|FL|SN|OV|DQ|W1|MW)-\d+[a-z]?|SYNC-F\d+)(?:\.[A-Za-z0-9]+)?`/g;

describe('every cited id resolves to a definition', () => {
  it('found the definitions at all', () => {
    expect(defined.size).toBeGreaterThan(150);
    for (const id of ['E-04', 'AX-03', 'IV-08', 'FE-11', 'SC-19', 'FL-06', 'SN-06', 'OV-02', 'DQ-19',
                      'W1-17', 'SYNC-F13', 'MW-08']) {
      expect(defined.has(id)).toBe(true);
    }
  });

  /**
   * Every live doc, not just SYSTEM.md. This started as a SYSTEM.md-only check,
   * which left `SCREENS.md`, `AGENTS.md`, `WALK-01.md` and `SYNC-MODEL.md` citing
   * ids nothing verified — and `MW-` spent weeks with 11 of its 26 citations
   * pointing at table rows that had been deleted, precisely because the 15 that
   * still resolved made the namespace look healthy.
   */
  it('resolves every citation, in every live doc', () => {
    const dangling: string[] = [];
    for (const file of liveDocs()) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(NAMESPACES)) {
        if (!defined.has(m[1])) dangling.push(`${path.relative(ROOT, file)} cites ${m[1]}`);
      }
    }
    expect([...new Set(dangling)].sort()).toEqual([]);
  });
});

describe('every test file a live doc names exists', () => {
  it('finds docs and tests at all', () => {
    expect(liveDocs().length).toBeGreaterThan(2);
    expect(testFileNames().size).toBeGreaterThan(100);
  });

  it('never cites a test that does not exist', () => {
    const have = testFileNames();
    const wrong: string[] = [];
    for (const file of liveDocs()) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/\b([A-Za-z][\w.]*)\.test\.ts\b/g)) {
          if (!have.has(m[1])) wrong.push(`${path.relative(ROOT, file)}:${i + 1} names ${m[0]}`);
        }
      });
    }
    expect(wrong).toEqual([]);
  });
});
