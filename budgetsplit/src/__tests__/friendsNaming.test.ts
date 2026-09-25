import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * "Keep the Friends icon at the top-right and make Friends management
 * consistent wherever it appears" (`SPEC-2026-09-FEEDBACK.md` §5, T12). The screen at
 * `/friends` was titled "People" in three places — its own `ScreenHeader`,
 * the Settings row that opens it, and the balance-list label on Groups —
 * while the code underneath already called the same list `friends` in two
 * of those three. One name now, everywhere: Friends.
 *
 * Source-scanned, the same shape as `payMethod.test.ts` and
 * `onboardingConsistency.test.ts` — there is no render test to catch a
 * relabel sliding back to "People" on one surface but not the others.
 */
const ROOT = join(__dirname, '..', '..');

function walk(dir: string, keep: (f: string) => boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      walk(full, keep, out);
    } else if (keep(full)) {
      out.push(full);
    }
  }
  return out;
}

const SOURCE_FILES = [
  ...walk(join(ROOT, 'app'), f => f.endsWith('.tsx')),
  ...walk(join(ROOT, 'src', 'components'), f => f.endsWith('.tsx')),
];

it('finds source files to scan', () => {
  // A guard that silently scans nothing passes forever. This is the canary.
  expect(SOURCE_FILES.length).toBeGreaterThan(50);
});

describe('the /friends screen is called Friends everywhere', () => {
  it('no title or label anywhere names the screen "People"', () => {
    const offenders: string[] = [];
    for (const f of SOURCE_FILES) {
      const src = readFileSync(f, 'utf8');
      if (/\b(?:title|label)="People"/.test(src)) offenders.push(f.replace(ROOT + '/', ''));
    }
    expect(offenders).toEqual([]);
  });

  it('the Groups tab header opens Friends', () => {
    const src = readFileSync(join(ROOT, 'app', '(tabs)', 'groups.tsx'), 'utf8');
    expect(src).toMatch(/router\.push\('\/friends'\)/);
    expect(src).toMatch(/accessibilityLabel="Friends"/);
  });
});
