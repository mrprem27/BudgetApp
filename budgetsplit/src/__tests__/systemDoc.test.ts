import fs from 'fs';
import path from 'path';
import { DEFAULTS } from '../lib/featureFlags';

/**
 * `docs/SYSTEM.md` describes the whole application: entities, invariants, features,
 * screens, flows, scenarios, complexity and open decisions. It exists because ten
 * other documents drifted — two of them still claimed sync did not exist while
 * `syncEngine.ts` was deployed — and a document nothing checks becomes the eleventh.
 *
 * These are the checks. They hold the document to the SHAPE of the code: that every
 * table has an entity, every route has a screen id, every flag has a feature, every
 * cited id resolves, and the one entry-point count we care about cannot grow. None
 * of them can tell whether the prose is TRUE — that is what the per-section
 * "Guarded by: nothing — read with suspicion" line is for.
 *
 * Same precedent as `docCoverage.test.ts` and `sourceCounts.test.ts`: scan the
 * source, don't trust the prose.
 */

const ROOT = path.resolve(__dirname, '../..');
const DOC = path.join(ROOT, 'docs/SYSTEM.md');
const APP = path.join(ROOT, 'app');
const doc = fs.readFileSync(DOC, 'utf8');

function walk(dir: string, keep: (f: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, keep));
    else if (keep(full)) out.push(full);
  }
  return out;
}
function routePath(absFile: string): string {
  const rel = path.relative(APP, absFile).replace(/\.tsx$/, '');
  const segments = rel.split(path.sep).filter(s => !/^\(.*\)$/.test(s));
  if (segments[segments.length - 1] === 'index') segments.pop();
  return '/' + segments.join('/');
}
const ROUTES = walk(APP, f => f.endsWith('.tsx') && path.basename(f) !== '_layout.tsx').map(routePath);

// ---------------------------------------------------------------- §2 entities

const schema = fs.readFileSync(path.join(ROOT, 'src/db/schema.ts'), 'utf8');
/** Real tables only — `IF NOT EXISTS` excludes the rebuild scratch tables. */
const TABLES = [...schema.matchAll(/^\s*CREATE TABLE IF NOT EXISTS (\w+)/gm)].map(m => m[1]);

/** `### E-04 · txn — a money event, and also a recurring rule` */
const ENTITY_HEADINGS = [...doc.matchAll(/^### (E-(\d+)[a-z]?) · (\S+)/gm)]
  .map(m => ({ id: m[1], num: Number(m[2]), name: m[3] }));

describe('§2 · every table has an entity, and every entity has a table', () => {
  it('finds tables and entities at all', () => {
    expect(TABLES.length).toBeGreaterThan(15);
    expect(ENTITY_HEADINGS.length).toBeGreaterThan(40);
  });

  it('documents every CREATE TABLE', () => {
    const named = new Set(ENTITY_HEADINGS.map(e => e.name));
    expect(TABLES.filter(t => !named.has(t))).toEqual([]);
  });

  it('never claims a table-backed entity (E-01…E-49) that does not exist', () => {
    const tables = new Set(TABLES);
    const wrong = ENTITY_HEADINGS
      .filter(e => e.num < 50 && !tables.has(e.name))
      .map(e => `${e.id} names \`${e.name}\`, which is not a table`);
    expect(wrong).toEqual([]);
  });

  it('gives every entity an "Is not" field — the anti-conflation field', () => {
    // Each entry is a fenced block; the field is what stops two concepts merging.
    const blocks = doc.split(/^### E-/m).slice(1);
    const missing = blocks
      .filter(b => !/^\s*Is not\./m.test(b))
      .map(b => 'E-' + b.slice(0, 20).split('\n')[0]);
    expect(missing).toEqual([]);
  });
});

// ---------------------------------------------------------------- §7 screens

/** One section's text, so a table in §12 cannot be mistaken for a table in §7. */
function section(n: number): string {
  const m = doc.match(new RegExp(`^## §${n} · [\\s\\S]*?(?=^## §|\\Z)`, 'm'));
  return m ? m[0] : '';
}

/**
 * `| \`SC-03\` | \`/\` | …` — the second cell is the route (or, for SC-01/02, a
 * layout file). Scoped to §7: §12 lists the three new ids in a table of the same
 * shape, and counting both makes every one of them look like a duplicate.
 */
const SCREEN_ROWS = [...section(7).matchAll(/^\| `(SC-\d+[a-z]?)` \| `([^`]+)` \|/gm)]
  .map(m => ({ id: m[1], target: m[2] }));

/** SC-01 and SC-02 are the root and tab layouts — structure, not screens. */
const LAYOUT_IDS = new Set(['SC-01', 'SC-02']);

describe('§7 · every route has exactly one screen id', () => {
  it('finds screen rows at all', () => {
    expect(SCREEN_ROWS.length).toBeGreaterThan(40);
  });

  it('documents every route', () => {
    const documented = new Set(SCREEN_ROWS.map(r => r.target));
    expect(ROUTES.filter(r => !documented.has(r))).toEqual([]);
  });

  it('never names a route that does not exist', () => {
    const real = new Set(ROUTES);
    const wrong = SCREEN_ROWS
      .filter(r => !LAYOUT_IDS.has(r.id) && !real.has(r.target))
      .map(r => `${r.id} → ${r.target}`);
    expect(wrong).toEqual([]);
  });

  it('gives each route exactly one id, and each id one route', () => {
    const byTarget = new Map<string, string[]>();
    const byId = new Map<string, string[]>();
    for (const r of SCREEN_ROWS) {
      if (LAYOUT_IDS.has(r.id)) continue;
      byTarget.set(r.target, [...(byTarget.get(r.target) ?? []), r.id]);
      byId.set(r.id, [...(byId.get(r.id) ?? []), r.target]);
    }
    expect([...byTarget].filter(([, ids]) => ids.length > 1)).toEqual([]);
    expect([...byId].filter(([, ts]) => ts.length > 1)).toEqual([]);
  });
});

// ---------------------------------------------------------------- §6 features

describe('§6 · every feature flag has a feature entry', () => {
  it('names every key in DEFAULTS', () => {
    const missing = Object.keys(DEFAULTS).filter(k => !new RegExp('`' + k + '`').test(doc));
    expect(missing).toEqual([]);
  });

  it('never names a flag key that no longer exists', () => {
    const keys = new Set(Object.keys(DEFAULTS));
    // The flag table's second column is the key, in backticks.
    // The default cell may be emphasised — `**off**` marks the one off-by-default key.
    const claimed = [...doc.matchAll(/^\| \d+ \| `(\w+)` \| \*{0,2}(?:on|off)\*{0,2} \|/gm)].map(m => m[1]);
    expect(claimed.filter(k => !keys.has(k))).toEqual([]);
    expect(claimed.length).toBe(keys.size);
  });
});

// ------------------------------------------------------------- §8 entry points

/**
 * The ceiling that makes §10's OV-08 actionable. `/add/quick` is the highest-fan-in
 * screen in the app; the number in its §8 header is a metric to watch fall, and the
 * same mechanism as `sourceCounts.test.ts`' 620-line ceiling on `review.tsx`, which
 * has already forced three real decompositions.
 *
 * Lower it when you consolidate an entry point. Never raise it.
 */
const ADD_QUICK_CEILING = 24;

const STR = String.raw`(?:\`((?:[^\\\`]|\\.)*)\`|'((?:[^\\']|\\.)*)'|"((?:[^\\"]|\\.)*)")`;
const NAV = new RegExp(
  String.raw`\brouter\s*\.\s*(?:push|replace|navigate|dismissTo)\s*\(\s*(?:\{\s*pathname\s*:\s*)?` + STR,
  'g',
);

function addQuickCallSites(): number {
  const files = [
    ...walk(APP, f => /\.tsx?$/.test(f)),
    ...walk(path.join(ROOT, 'src'), f => /\.tsx?$/.test(f) && !f.includes('__tests__')),
  ];
  let n = 0;
  for (const file of files) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(NAV)) {
      const t = (m[1] ?? m[2] ?? m[3] ?? '').split(/[?#]/)[0];
      if (t === '/add/quick') n++;
    }
  }
  return n;
}

describe('§8 · /add/quick entry points', () => {
  it(`stays at or under ${ADD_QUICK_CEILING}`, () => {
    expect(addQuickCallSites()).toBeLessThanOrEqual(ADD_QUICK_CEILING);
  });

  it('matches the count stated in the flow header', () => {
    const m = doc.match(/^### FL-04 · Add an expense — (\d+) entry points/m);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(addQuickCallSites());
  });
});

// ------------------------------------------------------------ §9 scenario rows

describe('§9 · every T3/T4 scenario row carries a status', () => {
  const MARKER = /`(?:✅[^`]*|🔍[^`]*|❓|❌[^`]*)`/;

  it('marks every tiered row', () => {
    const rows = doc.split('\n').filter(l => /^\| \.T[34][a-z] \|/.test(l));
    expect(rows.length).toBeGreaterThan(20);
    expect(rows.filter(l => !MARKER.test(l))).toEqual([]);
  });

  it('never cites a test file that does not exist', () => {
    const named = [...doc.matchAll(/`✅ ([A-Za-z][\w.]*?)(?:\.test\.ts)?`/g)].map(m => m[1]);
    const have = new Set(
      fs.readdirSync(path.join(ROOT, 'src/__tests__'))
        .filter(f => f.endsWith('.test.ts'))
        .map(f => f.replace(/\.test\.ts$/, '')),
    );
    expect([...new Set(named)].filter(n => !have.has(n))).toEqual([]);
  });
});

// ------------------------------------------------------------------ §12 id graph

/**
 * Every cited id resolves to a definition. This is what makes "file an issue against
 * FL-06.E7" durable: the prose under an id can change, but a citation must never
 * point at nothing. Generalises `docIds.test.ts`, which does this for `V2-` alone.
 */
describe('§12 · every cited id resolves to a definition', () => {
  const defined = new Set<string>();

  // `### E-04 · …`, `### FL-04 · …`, `### SN-04 · …`
  for (const m of doc.matchAll(/^### ((?:E|FL|SN)-\d+[a-z]?) ·/gm)) defined.add(m[1]);
  // Table rows: `| \`AX-01\` | …`
  for (const m of doc.matchAll(/^\| `((?:AX|IV|FE|SC|DQ|SN)-\d+[a-z]?)` \|/gm)) defined.add(m[1]);
  // Flag table: `| 1 | \`splitting\` | on | … | \`FE-11\` |`
  for (const m of doc.matchAll(/^\| \d+ \| `\w+` \|.*?`(FE-\d+)`.*\|$/gm)) defined.add(m[1]);
  // Code-block definitions: `OV-12 · …`, `FL-21 · …`, `SN-09  T0 …`
  for (const m of doc.matchAll(/^((?:OV|FL)-\d+) · /gm)) defined.add(m[1]);
  for (const m of doc.matchAll(/^(SN-\d+)\s+T0/gm)) defined.add(m[1]);
  // A ladder exists for every flow, by §9's coverage rule — that IS its definition.
  for (const id of [...defined]) if (id.startsWith('FL-')) defined.add(id.replace('FL-', 'SN-'));

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
