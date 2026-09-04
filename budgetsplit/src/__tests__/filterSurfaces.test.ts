import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * `OV-34`. Four surfaces filtered transactions, with **four** hand-rolled chip
 * implementations — and the shared component, `ui/FilterBar`, was one of them. It
 * built its own pills out of `TouchableOpacity` with a private 30pt stylesheet,
 * which is the exact rule `AGENTS.md` §9 exists to enforce.
 *
 * The behaviour had drifted further than the styling. Personal offered group scope
 * and **no text search at all**; the group ledger searched `category + note`;
 * Search searched a much wider haystack folding in tags and both spellings of the
 * amount. Date range lived only in Review, and **person existed nowhere** — in an
 * app whose whole premise is shared spending.
 *
 * Two guards, because the collapse has two halves: the chips are one component
 * (`ui/Chip`), and the matching is one function (`lib/txnFilter.ts`).
 */

const ROOT = join(__dirname, '..', '..');
const ROOTS = [join(ROOT, 'app'), join(ROOT, 'src', 'components')];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}
const label = (f: string) => f.split('/').slice(-2).join('/');
const FILES = ROOTS.flatMap(walk);

it('finds the source to scan', () => {
  expect(FILES.length).toBeGreaterThan(50);
});

describe('a filter chip is `ui/Chip`, everywhere', () => {
  /**
   * Allowed to declare a pill-painting style, each with the reason.
   *
   * The two that are not `ui/Chip` are the **remaining** hand-rolls of this class.
   * They are listed rather than fixed because neither is a filter — `OV-34` is
   * about the four surfaces that narrow a transaction list — and both make a
   * visual argument that changing would be a design decision, not a collapse.
   */
  const ALLOWED: Record<string, string> = {
    'ui/Chip.tsx': 'is the chip',
    'finance/CategoryChip.tsx':
      'A FILLED selected state (accent background, bg-coloured label) where `Chip` '
      + 'tints. Used in the Add screen\'s category row, where the fill is what marks '
      + 'the one chosen category among many. Converting it is a visual change.',
    'review/ReviewRowCard.tsx':
      'Row-internal pills sized by `flex: 1` to share a dense import row, not a chip '
      + 'row. `Chip` sizes to its content and only stretches with `grow`.',
  };

  it('declares no private pill-painting stylesheet', () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      if (ALLOWED[label(f)]) continue;
      const src = readFileSync(f, 'utf8');
      // A style entry NAMED like a chip that also PAINTS one. `chipRow`,
      // `chipScroll` and friends are layout containers and must not be caught —
      // an over-broad rule here would be suppressed rather than obeyed.
      for (const m of src.matchAll(/^\s+(?:chip|pill)\w*:\s*\{([^{}]*)\}/gm)) {
        const body = m[1];
        if (/borderRadius/.test(body) && /backgroundColor|borderWidth/.test(body)) {
          offenders.push(label(f));
        }
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  it('has no dead allowlist entry', () => {
    // An exemption matching nothing documents something that no longer exists —
    // and would quietly hide the next hand-roll that took the same filename.
    const stale = Object.keys(ALLOWED).filter(k => !FILES.some(f => label(f) === k));
    expect(stale).toEqual([]);
  });
});

describe('a transaction ledger filters through one predicate', () => {
  /**
   * The three ledger surfaces. Each renders a list of transactions and lets you
   * narrow it, so each must narrow it the same way — that is the half of `OV-34`
   * that a user can feel.
   *
   * Review is deliberately absent: it filters **pending imports**, not
   * transactions, and its model carries amount modes and an AND/OR combine that no
   * ledger has. Different domain, different engine (`lib/reviewFilter.ts`).
   */
  const LEDGERS = [
    join(ROOT, 'app', 'search.tsx'),
    join(ROOT, 'app', 'personal.tsx'),
    join(ROOT, 'src', 'components', 'finance', 'group', 'TransactionsTab.tsx'),
  ];

  it('has all three on `applyFilters`', () => {
    for (const f of LEDGERS) {
      expect({ file: label(f), shared: readFileSync(f, 'utf8').includes('applyFilters') })
        .toEqual({ file: label(f), shared: true });
    }
  });

  it('leaves no screen matching a haystack by hand', () => {
    // `.toLowerCase().includes(` over a template literal is what all three did.
    // The shared predicate owns that now; a screen doing it again has forked.
    const offenders: string[] = [];
    for (const f of LEDGERS) {
      const src = readFileSync(f, 'utf8');
      if (/\.toLowerCase\(\)[\s\S]{0,40}\.includes\(/.test(src)) offenders.push(label(f));
    }
    expect(offenders).toEqual([]);
  });

  it('offers date range and person on every one of them', () => {
    // The two fields that existed nowhere. A surface that renders `FilterBar`
    // without them is back to being a different filter with the same paint.
    const offenders: string[] = [];
    for (const f of LEDGERS) {
      const src = readFileSync(f, 'utf8');
      for (const prop of ['onRange=', 'onPerson=', 'onKind=']) {
        if (!src.includes(prop)) offenders.push(`${label(f)} — no ${prop}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
