import fs from 'fs';
import path from 'path';
import { ROOT, tracker, findings } from './helpers/systemDoc';

/**
 * Two files, one register.
 *
 * `docs/TRACKER.md` is the register: one row per item, what it is and where it
 * stands. `docs/FINDINGS.md` is the evidence: why each one exists, what it costs,
 * what breaks if you touch it. They were briefly one 996-line file, which was
 * neither scannable as a tracker nor readable as an argument.
 *
 * Before either, findings lived in **nine** registers across five documents that
 * had drifted into contradicting each other. The contradictions all had one cause:
 * **the same id maintained in two places.** Four sync failures carried opposite
 * statuses in two documents (three fixed in code while one doc still called them
 * open, one ticked done that was not); twenty-five decisions existed in two copies,
 * one of them in four; and every stated count was wrong because each copy was
 * recounted independently, or not at all.
 *
 * Splitting the register from the evidence re-creates exactly that risk, so it is
 * guarded rather than trusted: **every id has one row and one entry, and the two
 * sides must name the same set.** An item with a status and no evidence is a claim
 * nobody can check; evidence with no row is work that has fallen off the list.
 */

const DOCS = path.join(ROOT, 'docs');
const HISTORICAL = /^(AUDIT|V2_|DEBT_TRACKER|COMPETITIVE_ANALYSIS|WALK-01)/;

function liveDocs(): string[] {
  return fs.readdirSync(DOCS)
    .filter(f => f.endsWith('.md') && !HISTORICAL.test(f))
    .map(f => path.join(DOCS, f));
}
const rel = (f: string) => path.relative(ROOT, f);
const NS = String.raw`(?:OV|DQ|W1|B|D|A)-\d+[ab]?|SYNC-F\d+`;

function counted(ids: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

/**
 * A row in the register. Either a table row led by the id, or a member of a
 * section's `**Closed (n), detail in FINDINGS.md:** \`OV-03\` …` line — closed
 * items keep their place in the register without spending a row on each.
 */
function registerIds(): Map<string, number> {
  const out: string[] = [];
  for (const m of tracker.matchAll(new RegExp(String.raw`^\| \`(${NS})\` \|`, 'gm'))) out.push(m[1]);
  for (const line of tracker.split('\n')) {
    if (!/^\*\*Closed \(\d+\)/.test(line)) continue;
    for (const m of line.matchAll(new RegExp('`(' + NS + ')`', 'g'))) out.push(m[1]);
  }
  return counted(out);
}

/**
 * An entry in the evidence: a table row led by the id, or a fenced block headed by
 * it. Deliberately narrow — an id mentioned mid-sentence inside another entry is a
 * citation, and must not read as a second entry for itself.
 */
function evidenceIds(text: string): Map<string, number> {
  const out: string[] = [];
  for (const m of text.matchAll(new RegExp(String.raw`^\| \`(${NS})\`[^|]* \|`, 'gm'))) out.push(m[1]);
  for (const m of text.matchAll(/^(OV-\d+) · /gm)) out.push(m[1]);
  return counted(out);
}

describe('the register and the evidence name the same items', () => {
  it('finds both files, and enough in them to be worth comparing', () => {
    // Without this the comparisons below pass by reading nothing, which is exactly
    // how the old counts stayed green while the registers rotted.
    expect(tracker.length).toBeGreaterThan(3_000);
    expect(findings.length).toBeGreaterThan(30_000);
    expect(registerIds().size).toBeGreaterThan(150);
    expect(evidenceIds(findings).size).toBeGreaterThan(150);
  });

  it('gives every tracked item exactly one row and one entry', () => {
    const dupes = [
      ...[...registerIds()].filter(([, n]) => n > 1).map(([id, n]) => `TRACKER.md: ${id} ×${n}`),
      ...[...evidenceIds(findings)].filter(([, n]) => n > 1).map(([id, n]) => `FINDINGS.md: ${id} ×${n}`),
    ];
    expect(dupes.sort()).toEqual([]);
  });

  it('has no row without evidence, and no evidence without a row', () => {
    const reg = new Set(registerIds().keys());
    const ev = new Set(evidenceIds(findings).keys());
    expect({
      trackedButUnexplained: [...reg].filter(id => !ev.has(id)).sort(),
      explainedButUntracked: [...ev].filter(id => !reg.has(id)).sort(),
    }).toEqual({ trackedButUnexplained: [], explainedButUntracked: [] });
  });

  it('is the only pair of files that defines them', () => {
    const mine = new Set(['TRACKER.md', 'FINDINGS.md']);
    const elsewhere: string[] = [];
    for (const file of liveDocs()) {
      if (mine.has(path.basename(file))) continue;
      for (const id of evidenceIds(fs.readFileSync(file, 'utf8')).keys()) {
        elsewhere.push(`${rel(file)} redefines ${id}`);
      }
    }
    expect(elsewhere.sort()).toEqual([]);
  });
});

/**
 * Counts. Every "N items" the tracker states has to match what is under it.
 *
 * Five stated counts were wrong at once in the predecessor documents — a verdict
 * tally, an open-decision count, a note count, a check count and three different
 * unpushed-commit numbers. None was load-bearing on its own; together they were
 * the reason the registers stopped being believed.
 */
describe('every count the tracker states is true', () => {
  /** `**18 items: 12 `OPEN`, 1 `DECIDE`, 4 `DONE`.**` → the section's own arithmetic. */
  const HEADER = /\*\*(\d+) items:((?:\s+\d+ `[A-Z]+`,?)+)\.\*\*/g;

  it('has a section header whose parts sum to its total', () => {
    const seen = [...tracker.matchAll(HEADER)];
    expect(seen.length).toBeGreaterThan(5);
    const wrong = seen
      .map(m => ({
        stated: Number(m[1]),
        summed: [...m[2].matchAll(/(\d+) `[A-Z]+`/g)].reduce((a, x) => a + Number(x[1]), 0),
        text: m[0].slice(0, 60),
      }))
      .filter(r => r.stated !== r.summed);
    expect(wrong).toEqual([]);
  });

  it('states a total that matches the rows beneath it', () => {
    // Per section: the header total must equal the rows plus the closed list.
    const sections = tracker.split(/\n(?=## §)/).filter(s => HEADER.test(s + ''));
    const wrong: string[] = [];
    for (const s of sections) {
      const head = new RegExp(HEADER.source).exec(s);
      if (!head) continue;
      const rows = [...s.matchAll(new RegExp(String.raw`^\| \`(${NS})\` \|`, 'gm'))].length;
      const closed = Number((s.match(/\*\*Closed \((\d+)\)/) || [, 0])[1]);
      if (rows + closed !== Number(head[1])) {
        wrong.push(`${s.split('\n')[0]} — states ${head[1]}, has ${rows} rows + ${closed} closed`);
      }
    }
    expect(wrong.length).toBeGreaterThanOrEqual(0);
    expect(wrong).toEqual([]);
  });

  it('agrees with itself about how much is open', () => {
    const stated = tracker.match(/\*\*(\d+) items, (\d+) of them still open\.\*\*/);
    expect(stated).not.toBeNull();
    const [, total, open] = stated!.map(Number);
    expect(total).toBe(registerIds().size);
    // Everything that is not `DONE` is open work, however it is labelled.
    // `NS`, not a hand-written `[A-Z0-9-]+`: the latter silently skipped `W1-19b`,
    // whose lowercase leaf suffix is the whole reason that id exists.
    const rows = [...tracker.matchAll(new RegExp(String.raw`^\| \`(?:${NS})\` \|.*?\| \`([A-Z]+)\` \|`, 'gm'))];
    expect(rows.length).toBeGreaterThan(50);
    expect(rows.filter(m => m[1] !== 'DONE').length).toBe(open);
  });

  it('records that W1-38 was never assigned', () => {
    expect(registerIds().has('W1-38')).toBe(false);
    // Without backticks on purpose: an id that does not exist must not read as a
    // citation, or the dangling-reference guard needs an exception taught to it.
    expect(tracker).toMatch(/W1-38 was never used/);
  });
});

/**
 * The documents this was split out of must leave a pointer, not a hole. A reader
 * landing on `SYSTEM.md` §10 from one of its 55 surviving citations has to be told
 * where the register went — a deleted heading just reads as a document that lost
 * something.
 */
describe('the documents it was split out of point at it', () => {
  it('leaves a forwarding pointer in each', () => {
    for (const f of ['SYSTEM.md', 'SYNC-MODEL.md', 'RELEASE_CHECKLIST.md']) {
      expect({ file: f, points: fs.readFileSync(path.join(DOCS, f), 'utf8').includes('TRACKER.md') })
        .toEqual({ file: f, points: true });
    }
  });

  it('has the tracker and the evidence point at each other', () => {
    expect(tracker).toContain('FINDINGS.md');
    expect(findings).toContain('TRACKER.md');
  });
});
