import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * "Review places showing Upcoming, Reminder, Notification, Subscription,
 * Recurring, etc… make the terminology and UI consistent" (`SPEC-2026-09-FEEDBACK.md` §6, T16).
 * `/reminders` is `/upcoming` now, titled "Upcoming", and both places that
 * show the next few recurring charges (Plan, and this screen) render the
 * same `ComingUpList` rather than each hand-rolling its own row — which is
 * what let them show a genuinely different set of bills for the same money
 * without either screen being wrong on its own terms.
 *
 * Source-scanned, the same shape as `friendsNaming.test.ts` — there is no
 * render test to catch a stray `/reminders` link sliding back in, or a third
 * hand-rolled "what's due" list appearing next to the two that already
 * collapsed into one.
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
  expect(SOURCE_FILES.length).toBeGreaterThan(50);
});

describe('no source file still targets the old /reminders route', () => {
  it('no router.push/replace/Href literal names /reminders', () => {
    const offenders: string[] = [];
    for (const f of SOURCE_FILES) {
      const src = readFileSync(f, 'utf8');
      if (/['"`]\/reminders\b/.test(src)) offenders.push(f.replace(ROOT + '/', ''));
    }
    expect(offenders).toEqual([]);
  });

  it('app/upcoming.tsx exists and titles itself Upcoming', () => {
    const src = readFileSync(join(ROOT, 'app', 'upcoming.tsx'), 'utf8');
    expect(src).toMatch(/title="Upcoming"/);
  });
});

describe('the next-charges list is one component, not two implementations', () => {
  it('both Plan and the Upcoming screen render ComingUpList', () => {
    for (const f of [
      join(ROOT, 'app', '(tabs)', 'savings.tsx'),
      join(ROOT, 'app', 'upcoming.tsx'),
    ]) {
      expect(readFileSync(f, 'utf8')).toMatch(/<ComingUpList/);
    }
  });

  it("ComingUpList's own default title is Upcoming, not the old \"Coming up\"", () => {
    const src = readFileSync(
      join(ROOT, 'src', 'components', 'finance', 'home', 'ComingUpList.tsx'),
      'utf8',
    );
    expect(src).toMatch(/title = 'Upcoming'/);
  });
});
