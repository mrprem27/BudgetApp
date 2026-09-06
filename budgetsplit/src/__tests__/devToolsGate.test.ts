import fs from 'fs';
import path from 'path';
import { DEV_TOOLS_ENABLED } from '../constants/devTools';

/**
 * A temporary gate that nobody remembers is not temporary.
 *
 * `DEV_TOOLS_ENABLED` opens a screen that can erase every transaction, group,
 * person, budget and goal a user has entered, with no backup and no undo. It is
 * open on purpose during the pilot — reproducing a bug against a known dataset
 * beats rebuilding one by hand — and it must be shut before the App Store upload.
 *
 * "We'll remember" is not a mechanism. This is: while the gate is open, the
 * tracker must carry an **open** blocker saying so. Close the gate and the blocker
 * must be gone or marked done. Neither can drift from the other without the suite
 * failing.
 *
 * Same approach as `sourceCounts.test.ts` (docs must state the real flag count)
 * and `docCoverage.test.ts` (every route must be documented): scan the source,
 * don't trust the prose.
 *
 * The blocker lives in `docs/TRACKER.md` §1 now, not the release checklist, and it
 * is a table row with a status rather than a `- [ ]` checkbox. That move is exactly
 * what this test is for: it failed the moment the line went, which is how a guard
 * is supposed to behave when the thing it guards is relocated.
 */

const TRACKER = path.resolve(__dirname, '../../docs/TRACKER.md');
/** The exact marker the blocker must carry, so it can be found reliably. */
const MARKER = 'DEV_TOOLS_ENABLED';

function blockerRows(): string[] {
  return fs.readFileSync(TRACKER, 'utf8').split('\n').filter(l => l.includes(MARKER));
}
/** A row is unresolved while its status cell says anything but `DONE`. */
const unresolved = () => blockerRows().filter(l => /\|\s*`(OPEN|DECIDE|BLOCKED|PARKED)`\s*\|?\s*$/.test(l));

describe('the developer-tools gate cannot quietly become permanent', () => {
  it('is named in the tracker either way', () => {
    expect(blockerRows().length).toBeGreaterThan(0); // deleting the row is not how you close this
  });

  it('carries an UNRESOLVED blocker for as long as it is open', () => {
    if (!DEV_TOOLS_ENABLED) return; // closed: the assertion below takes over
    expect(unresolved().length).toBeGreaterThan(0);
  });

  it('leaves no unresolved blocker once it is closed', () => {
    if (DEV_TOOLS_ENABLED) return;
    // Gate shut → the tracker must not still be telling a reader to shut it.
    expect(unresolved()).toEqual([]);
  });

  /**
   * The gate is only worth anything if every entry point actually reads it. A
   * stray `__DEV__` left behind on this path would mean the constant closes three
   * doors and leaves a fourth open.
   */
  it('is the only gate on the developer screen and its entry point', () => {
    const files = ['../../app/storage.tsx', '../../app/(tabs)/settings.tsx'];
    for (const rel of files) {
      const src = fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
      // Strip comments before looking: `__DEV__` is legitimate PROSE in the
      // comment explaining why this gate replaced it, and a naive line filter
      // misses a JSX `{/* … */}` block, which is how that comment is written.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
      expect(code).not.toMatch(/\b__DEV__\b/);
    }
  });
});
