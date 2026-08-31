/** The single combined bucket for category names not in the user's catalog. */
export const OTHERS_LABEL = 'Others';

/**
 * Fold spend recorded under category names that aren't in the user's global
 * catalog into one combined "Others" bucket. Categories are global now; a name
 * a transaction carries but the user hasn't adopted (from an import, a rename,
 * or a co-member) counts as Others until adopted. Pure — used by every
 * spend-by-category breakdown so the rule is consistent app-wide.
 */
export function foldUncategorized(
  catMap: Record<string, number>,
  known: Set<string>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const name in catMap) {
    const key = known.has(name) ? name : OTHERS_LABEL;
    out[key] = (out[key] ?? 0) + catMap[name];
  }
  return out;
}

/**
 * Does this transaction belong under the selected category label?
 *
 * The inverse of {@link foldUncategorized}, and it has to exist because "Others"
 * on a chart is a **bucket**, not a category: it is the total of every name the
 * catalog does not contain. Filtering on the literal string instead — which is
 * what a category screen naturally does — showed an Others slice worth thousands
 * and then an empty list when it was tapped, because almost nothing is literally
 * categorised "Others". Peer entries are the ordinary way a name you have never
 * adopted enters your ledger, so this is not a corner case on a shared device.
 *
 * If the user has actually created a category called Others, it is a real
 * category and matches exactly, like any other.
 */
export function matchesCategory(
  txnCategory: string,
  selected: string,
  known: Set<string>,
): boolean {
  if (selected === OTHERS_LABEL && !known.has(OTHERS_LABEL)) return !known.has(txnCategory);
  return txnCategory === selected;
}
