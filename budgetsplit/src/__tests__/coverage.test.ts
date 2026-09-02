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

function coverage(): Record<string, { total: number; missing: string[] }> {
  execFileSync('node', ['scripts/build-system-map.js', OUT], { cwd: ROOT, stdio: 'pipe' });
  const html = fs.readFileSync(OUT, 'utf8');
  const m = html.match(/window\.__DATA__=(\{[\s\S]*?\});<\/script>/);
  if (!m) throw new Error('built page has no data block');
  return JSON.parse(m[1]).coverage;
}

let cov: Record<string, { total: number; missing: string[] }>;
beforeAll(() => { cov = coverage(); });
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
