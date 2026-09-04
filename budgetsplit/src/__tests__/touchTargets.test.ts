import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { layout } from '../theme';

/**
 * iOS HIG, and AGENTS §6: every interactive element is at least 44×44pt.
 *
 * A one-off sweep does not hold a floor — the next screen written puts a 32px
 * icon button back. This reads the real source the way `contrast.test.ts` reads
 * the real palette and `approvalInvariant.test.ts` reads the real SQL: a
 * tappable element styled below the floor must either carry `hitSlop` or be
 * listed here with a reason.
 *
 * Narrow, but no longer as narrow as it was, because what it could not see got
 * through. Two things were added after `DayOfMonthGrid` shipped 31 targets at
 * 41pt wide with a comment asserting they were 49:
 *
 * 1. **`layout.*` is resolved.** A style saying `height: layout.iconCircle` was
 *    invisible, because the check demanded a bare integer — so the tokens AGENTS
 *    §9 tells you to prefer were the ones it could not read. (Verified to add no
 *    new offenders when introduced; it widens sight, it does not move the floor.)
 * 2. **Percentage widths are computed**, see `columnWidth` below.
 *
 * Still outside what static reading can judge: `minHeight`, padding-driven
 * sizing, and anything whose size comes from a prop. A check that guesses gets
 * suppressed, so those stay out.
 */

const ROOTS = ['app', 'src/components'];
const TAPPABLE = /<(TouchableOpacity|Pressable|PressableScale)\b/g;
const FLOOR = 44;

/**
 * The narrowest screen this app can run on, in points.
 *
 * The iOS deployment target is **16.4** (`ios/Podfile`), which the 320pt iPhone SE
 * 1st gen cannot install — so the floor is the SE 2/3 at 375. Anything narrower is
 * Display Zoom, which shrinks the whole interface and is not the layout's contract.
 *
 * This is what makes a fractional width checkable at all: a column that is "a
 * seventh of the row" is 49pt here and 56pt on a Pro Max, so the narrowest device
 * is the only honest place to measure it.
 */
const NARROWEST_SCREEN = 375;

/**
 * Exempt, each with the reason. A bare list would rot into a suppression file;
 * the reason is what makes a future reader able to disagree with it.
 */
const EXEMPT: Record<string, string> = {
  'src/components/ui/TabPills.tsx:pill':
    'Segmented control. 36 tall with hitSlop {top:6,bottom:6} = 48 effective; the '
    + 'pill must match the indicator it sits on, which is a visual constraint.',
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx$/.test(p) && !p.includes('__tests__')) out.push(p);
  }
  return out;
}

/** Index of the `>` that actually closes the opening tag — JSX attributes contain `>`. */
function tagEnd(s: string, i: number): number {
  let depth = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return k;
  }
  return s.length;
}

/**
 * Every `StyleSheet.create` entry as `{ name: body }`.
 *
 * The inner alternation is what lets a body containing `${…}` through — the
 * original `[^{}]*` stopped dead at a template literal, so a style declaring
 * `width: \`${100 / 7}%\`` was not merely unmeasured, it was never seen at all.
 */
function styleEntries(src: string): Array<[string, string]> {
  return [...src.matchAll(/(\w+):\s*\{([^{}]*(?:\$\{[^}]*\}[^{}]*)*)\}/g)]
    .map(m => [m[1], m[2]] as [string, string]);
}

/** A dimension written as a bare number or as a `layout.*` token. */
function dimension(body: string, dim: 'width' | 'height'): number | null {
  const n = new RegExp(`\\b${dim}:\\s*(\\d+)`).exec(body);
  if (n) return Number(n[1]);
  const t = new RegExp(`\\b${dim}:\\s*layout\\.(\\w+)`).exec(body);
  const v = t ? (layout as Record<string, number>)[t[1]] : undefined;
  return typeof v === 'number' ? v : null;
}

/** Width/height in a style entry, if under the floor. */
function smallStyles(src: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const [name, body] of styleEntries(src)) {
    for (const dim of ['width', 'height'] as const) {
      const v = dimension(body, dim);
      if (v != null && v < FLOOR) out.set(name, Math.min(out.get(name) ?? Infinity, v));
    }
  }
  return out;
}

/**
 * What a percentage-width column actually measures on the narrowest phone.
 *
 * `null` when the entry has no percentage width. Otherwise: the screen less both
 * page gutters, times the fraction, **less the entry's own `padding`** — which is
 * the whole point. Padding on a width-carrying wrapper sits *inside* that width,
 * so it comes off the child; a `PressableScale` in there is the column minus twice
 * the padding, not the column. That is exactly how the day grid ended up at 41pt
 * while its docstring quoted the 49pt column as proof of compliance.
 *
 * Only `padding:` is subtracted, not `paddingHorizontal` — the shorthand is what
 * was actually used, and a check that guesses at every spacing form gets muted.
 */
function columnWidth(body: string): number | null {
  const pct = /width:\s*[`'"]?\$?\{?\s*([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\}?\s*%/.exec(body);
  if (!pct) return null;
  const fraction = (Number(pct[1]) / (pct[2] ? Number(pct[2]) : 1)) / 100;
  const row = NARROWEST_SCREEN - 2 * layout.screenPaddingH;

  const pad = /\bpadding:\s*space\.(\w+)/.exec(body);
  const SPACE: Record<string, number> = { xs: 4, sm: 8, smd: 12, md: 16, lg: 24, xl: 32 };
  const inset = pad ? (SPACE[pad[1]] ?? 0) : Number(/\bpadding:\s*(\d+)/.exec(body)?.[1] ?? 0);

  return row * fraction - 2 * inset;
}

describe('every tappable element clears the 44pt floor', () => {
  const files = ROOTS.flatMap(walk);

  it('finds source to check (guards against the walker silently matching nothing)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('has no undersized tappable without hitSlop or a recorded reason', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const small = smallStyles(src);
      if (small.size === 0) continue;

      for (const m of src.matchAll(TAPPABLE)) {
        const i = m.index!;
        const el = src.slice(i, tagEnd(src, i));
        if (el.includes('hitSlop')) continue;

        for (const [name, px] of small) {
          if (!el.includes(`styles.${name}`)) continue;
          if (EXEMPT[`${file}:${name}`]) continue;
          const line = src.slice(0, i).split('\n').length;
          offenders.push(`${file}:${line} — styles.${name} is ${px}px, no hitSlop`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * A grid of columns is the one layout where the target can be too narrow while
   * every number in the file looks fine. `DayOfMonthGrid` had 31 of them: seven
   * per row, `layout.touchMin` tall so the height was unimpeachable, and the width
   * left implicit in a percentage.
   *
   * The rule is not "don't use percentage widths" — it is that the gutter belongs
   * **outside** the width-carrying box (a `margin` on the painted child), not
   * inside it as `padding`, because the tappable element is the child.
   */
  it('has no fractional column that lands under the floor on the narrowest phone', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      if (!TAPPABLE.test(src)) { TAPPABLE.lastIndex = 0; continue; }
      TAPPABLE.lastIndex = 0;

      for (const [name, body] of styleEntries(src)) {
        const w = columnWidth(body);
        if (w == null || w >= FLOOR) continue;
        if (EXEMPT[`${file}:${name}`]) continue;
        offenders.push(`${file} — styles.${name} is ${w.toFixed(1)}pt wide at ${NARROWEST_SCREEN}pt`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('has no dead exemptions', () => {
    // An exemption matching nothing is a stale claim about the code, and the
    // reason it carries is then documenting something that no longer exists.
    const stale = Object.keys(EXEMPT).filter(key => {
      const [file, name] = key.split(':');
      try { return !smallStyles(readFileSync(file, 'utf8')).has(name); } catch { return true; }
    });
    expect(stale).toEqual([]);
  });
});
