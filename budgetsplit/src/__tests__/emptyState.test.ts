import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Nobody hand-rolls an empty state again.
 *
 * `AGENTS.md` §2 has always specified the anatomy — 64pt icon circle, title,
 * explanation, CTA — and it drifted anyway, because specifying a shape does not
 * stop anyone rebuilding it. Home built its own with a 72pt tile and a raw accent
 * `TouchableOpacity`; `ShareGroupRow` built one at the right size and the wrong
 * padding; `settings/linked.tsx` wrapped the real one in a Card. Four renderings
 * of one component, at three different heights.
 *
 * The fix was worth less than this test. **A 64pt `IconCircle` is the signature of
 * an empty state**, so one appearing outside `EmptyState.tsx` means somebody is
 * building a second one — which is exactly what both hand-rolls looked like.
 *
 * Same mechanism as `trustCopy.test.ts`, `memberInvariant.test.ts` and
 * `approvalInvariant.test.ts`: scan the real source, and require an allowlist
 * entry with a stated reason rather than a silent exception.
 */

const ROOT = join(__dirname, '..', '..');
const ROOTS = [join(ROOT, 'app'), join(ROOT, 'src', 'components')];

/**
 * Legitimately a 64pt disc, and not an empty state.
 *
 * The reason is required, and is the point: an entry here is a claim that the
 * component means something else, which is reviewable. An entry with no reason is
 * somebody silencing the test.
 */
const ALLOWED: Record<string, string> = {
  'ui/EmptyState.tsx': 'is the empty state',
  'finance/GoalCelebration.tsx':
    'a celebration, not an absence — it marks a goal REACHED, and borrows the same '
    + 'disc size because it is the same visual weight for the opposite event',
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** `app/(tabs)/index.tsx` → `(tabs)/index.tsx`; components keep their bucket. */
const label = (f: string) => f.split('/').slice(-2).join('/');

describe('the empty state is built once', () => {
  it('finds the source to scan', () => {
    expect(ROOTS.flatMap(walk).length).toBeGreaterThan(50);
  });

  it('has no 64pt icon circle outside the component that owns it', () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap(walk)) {
      if (!/size=\{64\}/.test(readFileSync(file, 'utf8'))) continue;
      if (!ALLOWED[label(file)]) offenders.push(label(file));
    }
    expect(offenders).toEqual([]);
  });

  it('makes every exception say why it is one', () => {
    for (const [file, reason] of Object.entries(ALLOWED)) {
      expect(reason.length).toBeGreaterThan(12);
    }
  });
});

/**
 * The anchor is opt-in, and must stay that way.
 *
 * `flex: 1` resolves against an auto-height parent as ZERO, and ~30 of this
 * component's call sites are inside a `ScrollView` content container or a
 * `ListEmptyComponent` — both auto-height. `ErrorState` wraps it for 32 more. So
 * putting the anchor on the shared `wrap` style collapses most of the app's empty
 * states to nothing, silently, with no render test anywhere to catch it.
 */
describe('the fill anchor', () => {
  const src = readFileSync(join(ROOT, 'src/components/ui/EmptyState.tsx'), 'utf8');

  it('never puts flex on the style every caller gets', () => {
    const wrap = /wrap: \{[^}]*\}/.exec(src)?.[0] ?? '';
    expect(wrap).not.toMatch(/flex:/);
    expect(wrap).not.toMatch(/justifyContent:/);
  });

  it('keeps it behind a prop', () => {
    expect(src).toMatch(/fill && styles\.fill/);
    expect(/fill: \{[^}]*\}/.exec(src)?.[0] ?? '').toMatch(/flex: 1/);
  });
});
