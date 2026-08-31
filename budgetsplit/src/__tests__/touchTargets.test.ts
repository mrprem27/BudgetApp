import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * iOS HIG, and AGENTS §6: every interactive element is at least 44×44pt.
 *
 * A one-off sweep does not hold a floor — the next screen written puts a 32px
 * icon button back. This reads the real source the way `contrast.test.ts` reads
 * the real palette and `approvalInvariant.test.ts` reads the real SQL: a
 * tappable element styled below the floor must either carry `hitSlop` or be
 * listed here with a reason.
 *
 * Deliberately narrow. It only inspects a style referenced from a tappable
 * element's own `style` prop and only flags an explicit numeric `width`/`height`
 * under 44 — `minHeight`, padding-driven sizing and computed values are outside
 * what static reading can judge, and a check that guesses gets suppressed.
 */

const ROOTS = ['app', 'src/components'];
const TAPPABLE = /<(TouchableOpacity|Pressable|PressableScale)\b/g;
const FLOOR = 44;

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

/** Explicit numeric width/height in a `StyleSheet.create` entry, if under the floor. */
function smallStyles(src: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of src.matchAll(/(\w+):\s*\{([^{}]*)\}/g)) {
    const [, name, body] = m;
    for (const dim of ['width', 'height'] as const) {
      const v = new RegExp(`\\b${dim}:\\s*(\\d+)`).exec(body);
      if (v && Number(v[1]) < FLOOR) out.set(name, Math.min(out.get(name) ?? Infinity, Number(v[1])));
    }
  }
  return out;
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
