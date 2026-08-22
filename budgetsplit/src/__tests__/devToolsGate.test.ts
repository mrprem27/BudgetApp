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
 * release checklist must carry an **unchecked** blocker saying so. Close the gate
 * and the blocker must be gone or ticked. Neither can drift from the other without
 * the suite failing.
 *
 * Same approach as `sourceCounts.test.ts` (docs must state the real flag count)
 * and `docCoverage.test.ts` (every route must be documented): scan the source,
 * don't trust the prose.
 */

const CHECKLIST = path.resolve(__dirname, '../../docs/RELEASE_CHECKLIST.md');
/** The exact marker the checklist line must carry, so it can be found reliably. */
const MARKER = 'DEV_TOOLS_ENABLED';

function checklistLines(): string[] {
  return fs.readFileSync(CHECKLIST, 'utf8').split('\n').filter(l => l.includes(MARKER));
}

describe('the developer-tools gate cannot quietly become permanent', () => {
  it('is named in the release checklist either way', () => {
    const lines = checklistLines();
    expect(lines.length).toBeGreaterThan(0); // deleting the line is not how you close this
  });

  it('carries an UNCHECKED blocker for as long as it is open', () => {
    if (!DEV_TOOLS_ENABLED) return; // closed: the assertion below takes over
    const unchecked = checklistLines().filter(l => l.trimStart().startsWith('- [ ]'));
    expect(unchecked.length).toBeGreaterThan(0);
  });

  it('leaves no unchecked blocker once it is closed', () => {
    if (DEV_TOOLS_ENABLED) return;
    // Gate shut → the checklist must not still be telling a reader to shut it.
    const unchecked = checklistLines().filter(l => l.trimStart().startsWith('- [ ]'));
    expect(unchecked).toEqual([]);
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
