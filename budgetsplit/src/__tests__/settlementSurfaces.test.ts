import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { TXN_KIND_LABEL_PLURAL } from '../constants/enums';

/**
 * `kind = 'settlement'` means four different things (`OV-02`), and six places were
 * each deciding which — producing **four different words for one event**:
 * "Transfers", "Settlement", "Settlements", "settled".
 *
 * `lib/settlementView.ts` answers it once. This is what keeps it that way, on the
 * same principle as `filterSurfaces.test.ts` and `payMethod.test.ts`: the collapse
 * is worth less than the mechanism that holds it.
 */

const ROOT = join(__dirname, '..', '..');
const ROOTS = [join(ROOT, 'app'), join(ROOT, 'src')];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.tsx') || full.endsWith('.ts')) out.push(full);
  }
  return out;
}
const label = (f: string) => f.split('/').slice(-2).join('/');
const FILES = ROOTS.flatMap(walk);

it('finds the source to scan', () => {
  expect(FILES.length).toBeGreaterThan(100);
});

describe('what a settlement IS gets decided in one place', () => {
  /**
   * Allowed to test `asset_id` directly, each with the reason. Everything else
   * must ask `settlementView` / `isInvestment`, or it is a seventh derivation.
   */
  const ALLOWED: Record<string, string> = {
    'lib/settlementView.ts': 'is the presenter',
    'lib/splitMath.ts': 'investedOf — the figure, whose discriminator must match the presenter\'s',
    'queries/assets.ts': 'owns the register; writes the column and refuses a delete on it',
    'queries/transactions.ts': 'the asset ledger query, and reverseAssetSide on delete/restore',
    'hooks/useAddTxnForm.ts': 'the Add screen writes it',
    'hooks/useTxnDetail.ts': 'resolves the asset NAME for the presenter to use',
    'finance/TransactionRow.tsx': 'passes the resolved name in; does not classify',
    'lib/backup.ts': 'orders `asset` before `txn` because the column points at it',
  };

  it('has nothing else branching on asset_id', () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      if (ALLOWED[label(f)]) continue;
      // Comments stripped first. A docblock EXPLAINING the discriminator is the
      // opposite of a second implementation of it, and a guard that cannot tell
      // them apart gets suppressed rather than obeyed.
      const src = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      // A read, not a write: `asset_id` appearing in a comparison or a guard.
      if (/asset_id\s*(?:\?|!==|===|\)|\s*&&)/.test(src) || /\.asset_id\b(?!\s*[,:])/.test(src)) {
        offenders.push(label(f));
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  it('has no dead allowlist entry', () => {
    const stale = Object.keys(ALLOWED).filter(k => !FILES.some(f => label(f) === k));
    expect(stale).toEqual([]);
  });
});

/**
 * `IV-17` — *"never show one total across kinds"* — is marked **unenforced** in
 * `SYSTEM.md`, and has shipped as a bug twice: `report-transactions` dropped
 * settlements from a filter labelled "All", and `search` summed only expenses under
 * the word "total".
 *
 * A surface that sums transactions must bucket them. This looks for the shape that
 * fails: a reduce over a mixed list into ONE accumulator.
 */
describe('no surface sums across kinds', () => {
  /**
   * The screens that hold a **mixed** list and show a figure over it.
   *
   * `reports.tsx` is deliberately absent: `reportsData` filters to expense and
   * income and it prints them as two independently named cards, so there is no
   * mixed list for a total to be taken over. Its risk is a different one — its
   * "Saved" figure is net income wearing a savings word — and that is a copy
   * problem, not this rule.
   */
  const SUMMING = [
    join(ROOT, 'app', 'search.tsx'),
    join(ROOT, 'app', 'report-transactions.tsx'),
  ];

  it('keeps a per-kind bucket, or shows no figure at all', () => {
    for (const f of SUMMING) {
      const src = readFileSync(f, 'utf8');
      // Either it buckets (`byKind`) or it refuses to total a mixed list — Search
      // shows no figure on "All" for exactly this reason.
      const buckets = /byKind|per[- ]kind/i.test(src);
      // Whitespace-tolerant: the refusal is written across three lines in Search,
      // and a guard that only matches one formatting of it is a guard that reports
      // a violation the next time somebody runs a formatter.
      const refuses = /kind\s*===\s*(?:'all'|KIND_ANY)\s*\n?\s*\?\s*0/.test(src);
      expect({ file: label(f), safe: buckets || refuses })
        .toEqual({ file: label(f), safe: true });
    }
  });

  it('labels a settlement total with one word, everywhere', () => {
    // Four words for one movement is what OV-34/OV-01 collapsed. The plural label
    // is the shared one; a screen inventing a fifth has forked.
    expect(TXN_KIND_LABEL_PLURAL.settlement).toBe('Transfers');
    const banned = ['Settlements'];
    const offenders: string[] = [];
    for (const f of FILES) {
      if (label(f) === 'constants/enums.ts') continue;   // documents the history
      const src = readFileSync(f, 'utf8');
      for (const w of banned) {
        if (src.includes(`'${w}'`) || src.includes(`>${w}<`)) offenders.push(`${label(f)} — ${w}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
