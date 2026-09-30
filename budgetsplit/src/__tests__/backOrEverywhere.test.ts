import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * `OV-10`, closed 2026-09-30: no screen calls a bare `router.back()`. On a cold start (a tapped
 * reminder, the voice shortcut, a sign-in or invite link) the stack is empty and a bare back does
 * nothing at all; `backOr` goes somewhere sensible instead (`lib/nav.ts`).
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

describe('every back button works on a cold start', () => {
  it('no route calls a bare router.back()', () => {
    const bare = files(join(__dirname, '../../app')).filter(p => readFileSync(p, 'utf8').includes('router.back()'));
    expect(bare).toEqual([]);
  });
});
