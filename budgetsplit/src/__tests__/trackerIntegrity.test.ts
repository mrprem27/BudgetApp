import fs from 'fs';
import path from 'path';
import { ROOT, tracker } from './helpers/systemDoc';

/**
 * `docs/TRACKER.md` is the single register of open findings, decisions and
 * deferrals. Before it there were **nine**, spread across five documents, and they
 * had drifted into contradicting each other — which is the whole reason this file
 * exists rather than a tidier version of the old arrangement.
 *
 * The contradictions all had one cause: **the same id maintained in two places.**
 * Four sync failures carried opposite statuses in two documents (three fixed in
 * code while one doc still called them open, one ticked done that was not);
 * twenty-five decisions existed in two copies, one of them in four; and every
 * stated count was wrong because each copy was recounted independently, or not at
 * all.
 *
 * So this guards the property that makes the register trustworthy rather than any
 * particular entry: **one definition per id, and every stated count derived from
 * what is actually there.** Fixing the nine registers was worth less than the
 * mechanism that stops there being ten.
 */

const DOCS = path.join(ROOT, 'docs');
const HISTORICAL = /^(AUDIT|V2_|DEBT_TRACKER|COMPETITIVE_ANALYSIS|WALK-01)/;

function liveDocs(): string[] {
  return fs.readdirSync(DOCS)
    .filter(f => f.endsWith('.md') && !HISTORICAL.test(f))
    .map(f => path.join(DOCS, f));
}
const rel = (f: string) => path.relative(ROOT, f);

/**
 * A **definition** is an entry at the start of its own line — a table row opening
 * with the id, or a fenced block headed by it. A citation is the same id anywhere
 * else: mid-sentence, in prose, inside another entry's cell. The distinction is
 * the entire test, so it is deliberately narrow: `\`OV-02\`` mentioned in a
 * sentence must not read as a second definition of `OV-02`.
 */
function definitionsIn(text: string): Map<string, number> {
  const found = new Map<string, number>();
  const bump = (id: string) => found.set(id, (found.get(id) ?? 0) + 1);
  for (const m of text.matchAll(/^\| `((?:OV|DQ|W1)-\d+[ab]?|SYNC-F\d+)`[^|]* \|/gm)) bump(m[1]);
  for (const m of text.matchAll(/^((?:OV)-\d+) · /gm)) bump(m[1]);
  return found;
}

describe('the tracker is the only place an id is defined', () => {
  it('finds the tracker and the other live docs at all', () => {
    // Without this the two tests below pass by reading nothing, which is exactly
    // how the old counts stayed green while the registers rotted.
    expect(tracker.length).toBeGreaterThan(10_000);
    expect(liveDocs().length).toBeGreaterThan(2);
    expect(definitionsIn(tracker).size).toBeGreaterThan(100);
  });

  it('defines every OV-, DQ-, W1- and SYNC-F id exactly once', () => {
    const dupes = [...definitionsIn(tracker).entries()]
      .filter(([, n]) => n > 1)
      .map(([id, n]) => `${id} defined ${n}× in TRACKER.md`);
    expect(dupes.sort()).toEqual([]);
  });

  it('is the only live doc that defines them', () => {
    const elsewhere: string[] = [];
    for (const file of liveDocs()) {
      if (path.basename(file) === 'TRACKER.md') continue;
      for (const id of definitionsIn(fs.readFileSync(file, 'utf8')).keys()) {
        elsewhere.push(`${rel(file)} redefines ${id}`);
      }
    }
    expect(elsewhere.sort()).toEqual([]);
  });
});

/**
 * Counts. Every "N entries" the tracker states has to match what is under it.
 *
 * Five stated counts were wrong at once in the predecessor documents — a verdict
 * tally, an open-decision count, a note count, a check count and three different
 * unpushed-commit numbers. None was load-bearing on its own; together they were
 * the reason the registers stopped being believed.
 */
describe('every count the tracker states is true', () => {
  const ids = (re: RegExp) => new Set([...tracker.matchAll(re)].map(m => m[1]));

  it('counts OV- correctly', () => {
    const all = ids(/^(OV-\d+) · /gm);
    expect(all.size).toBeGreaterThan(30);            // never vacuous
    const stated = tracker.match(/\*\*(\d+) entries:\s+(\d+) `DONE`,\s+(\d+) `OPEN`,\s+(\d+) `PARKED`,\s+(\d+) `DECIDE`\.\*\*/);
    expect(stated).not.toBeNull();
    const [, total, done, open, parked, decide] = stated!.map(Number);
    expect(total).toBe(all.size);
    expect(done + open + parked + decide).toBe(total);
  });

  it('counts the OV- verdicts correctly', () => {
    const tally = tracker.match(
      /\*\*By verdict:\*\* (\d+) `COLLAPSE` · (\d+) `COLLAPSE-AFTER-PILOT` · (\d+) `RENAME-ONLY` ·\s+(\d+) `KEEP-DOCUMENTED` ·\s+(\d+) `LABELLED` · (\d+) `NEEDS-DECISION`\./,
    );
    expect(tally).not.toBeNull();
    const counted: Record<string, number> = {};
    for (const m of tracker.matchAll(/^ {2}Verdict\.\s+([A-Z][A-Z-]+)/gm)) {
      counted[m[1]] = (counted[m[1]] ?? 0) + 1;
    }
    expect(Object.keys(counted).length).toBeGreaterThan(3);
    const [, collapse, after, rename, keep, labelled, decide] = tally!.map(Number);
    expect({
      COLLAPSE: collapse, 'COLLAPSE-AFTER-PILOT': after, 'RENAME-ONLY': rename,
      'KEEP-DOCUMENTED': keep, LABELLED: labelled, 'NEEDS-DECISION': decide,
    }).toEqual(counted);
  });

  it('counts DQ- correctly', () => {
    const all = ids(/^\| `(DQ-\d+)` \|/gm);
    expect(all.size).toBeGreaterThan(30);
    const stated = tracker.match(/\*\*(\d+) entries:\s+(\d+) answered and kept,\s+(\d+) still open,\s+(\d+) `BLOCKED`/);
    expect(stated).not.toBeNull();
    const [, total, answered, open, blocked] = stated!.map(Number);
    expect(total).toBe(all.size);
    expect(answered + open + blocked).toBe(total);
  });

  it('counts W1- correctly, and records that W1-38 was never assigned', () => {
    const all = ids(/^\| `(W1-\d+[ab]?)` \|/gm);
    expect(all.size).toBeGreaterThan(30);
    const stated = tracker.match(/\*\*(\d+) leaves:\s+(\d+) `DONE`,\s+(\d+) `OPEN`,\s+(\d+) `PARKED`\.\*\*/);
    expect(stated).not.toBeNull();
    const [, leaves, done, open, parked] = stated!.map(Number);
    expect(done + open + parked).toBe(leaves);
    expect(leaves).toBe(all.size);
    // Recorded rather than renumbered, so nobody goes looking for it. Written
    // without backticks on purpose: an id that does not exist must not read as a
    // citation, or the dangling-reference guard has to be taught an exception.
    expect(all.has('W1-38')).toBe(false);
    expect(tracker).toMatch(/W1-38 was never used/);
  });

  it('counts SYNC-F correctly', () => {
    const all = ids(/^\| `(SYNC-F\d+)`[^|]* \|/gm);
    expect(all.size).toBeGreaterThan(20);
    const stated = tracker.match(/\*\*(\d+) failures:\s+(\d+) `DONE`,\s+(\d+) `OPEN`\.\*\*/);
    expect(stated).not.toBeNull();
    const [, total, done, open] = stated!.map(Number);
    expect(total).toBe(all.size);
    expect(done + open).toBe(total);
  });
});

/**
 * The vacated sections must leave a pointer, not a hole. A reader landing on
 * `SYSTEM.md` §10 from one of its 55 surviving citations has to be told where the
 * register went — a deleted heading just reads as a document that lost something.
 */
describe('the documents it was split out of point at it', () => {
  it('leaves a forwarding pointer in each', () => {
    for (const f of ['SYSTEM.md', 'SYNC-MODEL.md', 'RELEASE_CHECKLIST.md']) {
      expect({ file: f, points: fs.readFileSync(path.join(DOCS, f), 'utf8').includes('TRACKER.md') })
        .toEqual({ file: f, points: true });
    }
  });
});
