import fs from 'fs';
import path from 'path';
import { ROOT, doc, testFileNames } from './helpers/systemDoc';

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

// `### E-04 · …`, `### FL-04 · …`, `### SN-04 · …`
for (const m of doc.matchAll(/^### ((?:E|FL|SN)-\d+[a-z]?) ·/gm)) defined.add(m[1]);
// Table rows: `| \`AX-01\` | …`
for (const m of doc.matchAll(/^\| `((?:AX|IV|FE|SC|DQ|SN)-\d+[a-z]?)` \|/gm)) defined.add(m[1]);
// The flag table carries its feature id in a later column.
for (const m of doc.matchAll(/^\| \d+ \| `\w+` \|.*?`(FE-\d+)`.*\|$/gm)) defined.add(m[1]);
// Fenced definitions: `OV-12 · …`, `FL-21 · …`, `SN-09  T0 …`
for (const m of doc.matchAll(/^((?:OV|FL)-\d+) · /gm)) defined.add(m[1]);
for (const m of doc.matchAll(/^(SN-\d+)\s+T0/gm)) defined.add(m[1]);
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

describe('every cited id resolves to a definition', () => {
  it('found the definitions at all', () => {
    expect(defined.size).toBeGreaterThan(150);
    for (const id of ['E-04', 'AX-03', 'IV-08', 'FE-11', 'SC-19', 'FL-06', 'SN-06', 'OV-02', 'DQ-19']) {
      expect(defined.has(id)).toBe(true);
    }
  });

  it('resolves every citation', () => {
    const cited = new Set(
      [...doc.matchAll(/`((?:E|AX|IV|FE|SC|FL|SN|OV|DQ)-\d+[a-z]?)(?:\.[A-Za-z0-9]+)?`/g)].map(m => m[1]),
    );
    expect([...cited].filter(id => !defined.has(id)).sort()).toEqual([]);
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
