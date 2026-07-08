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
