import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ROOT } from './helpers/systemDoc';

/**
 * "Nothing is missing" is the claim the walkthrough makes, and until this test it
 * was a feeling. The booklets are assembled from `docs/SYSTEM.md` plus the import
 * graph; this builds them the same way the page does and fails if a single screen,
 * task, component, rule, finding or open question is not in one.
 *
 * It runs the real builder rather than reimplementing the assembly, because two
 * implementations of the same rule is how they start disagreeing — which is the
 * whole subject of the document it checks.
 */

const OUT = path.join(os.tmpdir(), `bs-coverage-${process.pid}.html`);

type Built = {
  coverage: Record<string, { total: number; missing: string[] }>;
  screens: Array<{ id: string; reach: string }>;
  booklets: Array<{ name: string; min: number; stops: Array<{ min: number }> }>;
  time: { total: number; setup: number; longest: number };
};

function build(): Built {
  execFileSync('node', ['scripts/build-system-map.js', OUT], { cwd: ROOT, stdio: 'pipe' });
  const html = fs.readFileSync(OUT, 'utf8');
  const m = html.match(/window\.__DATA__=(\{[\s\S]*?\});<\/script>/);
  if (!m) throw new Error('built page has no data block');
  return JSON.parse(m[1]);
}

let built: Built;
let cov: Record<string, { total: number; missing: string[] }>;
beforeAll(() => { built = build(); cov = built.coverage; });
afterAll(() => { try { fs.unlinkSync(OUT); } catch { /* already gone */ } });

describe('the walkthrough leaves nothing out', () => {
  it('built the booklets at all', () => {
    expect(Object.keys(cov).sort())
      .toEqual(['components', 'decisions', 'flows', 'problems', 'rules', 'screens']);
    for (const v of Object.values(cov)) expect(v.total).toBeGreaterThan(15);
  });

  /* One assertion each, so a failure names the thing that fell out rather than
     saying "coverage broke". */
  for (const kind of ['screens', 'flows', 'components', 'rules', 'problems', 'decisions']) {
    it(`walks every one of the ${kind}`, () => {
      expect({ [kind]: cov[kind].missing }).toEqual({ [kind]: [] });
    });
  }
});

describe('the walkthrough is usable, not just complete', () => {
  it('tells you how to get to every screen', () => {
    /* A route is not a direction. `/group/[id]/budget` is unusable with a phone
       in your hand; "Groups → a group → Budget tab" is not. SC-01 and SC-02 are
       the shell and the tab bar — you are always inside them. */
    const missing = built.screens
      .filter(s => !s.reach && !['SC-01', 'SC-02'].includes(s.id))
      .map(s => s.id);
    expect(missing).toEqual([]);
  });

  it('keeps every booklet to a sitting', () => {
    /* The point of the word. Capping on stop count instead of time once produced
       an 89-minute "booklet". A single stop longer than the cap cannot be split. */
    const tooLong = built.booklets
      .filter(b => b.min > 35 && b.stops.length > 1)
      .map(b => `${b.name} — ${b.min} min`);
    expect(tooLong).toEqual([]);
  });

  it('adds its estimates up', () => {
    const wrong = built.booklets
      .filter(b => Math.abs(b.min - (b.stops.reduce((n, s) => n + s.min, 0) + built.time.setup)) > 0.6)
      .map(b => b.name);
    expect(wrong).toEqual([]);
    expect(built.time.total).toBe(built.booklets.reduce((n, b) => n + b.min, 0));
  });
});
