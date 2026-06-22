import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Learned title→category mappings. When the user overrides a smart-category
 * guess, we remember the salient words of that title so the same words pick the
 * corrected category next time. Stored on-device as a flat word→category map.
 */
const KEY = 'smart_cat_learned';
const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'from', 'to', 'at', 'on', 'in', 'of', 'a', 'an', 'my', 'this', 'that', 'paid', 'bought', 'new']);

export type LearnedMap = Record<string, string>;

/** Distinctive lowercase words of a title (drops stopwords + very short tokens). */
export function wordsOf(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * A learned category for this title, or null. Tallies a vote across the title's
 * words: each word that maps to a still-existing category casts one vote, and
 * the category with the most votes wins (ties broken by first appearance). This
 * is sturdier than taking the first match — e.g. "swiggy office lunch" where two
 * words learned "Food Delivery" and one learned something stale outvotes cleanly.
 */
export function learnedMatch(title: string, learned: LearnedMap, available: { name: string }[]): string | null {
  const names = new Set(available.map(c => c.name));
  const votes = new Map<string, number>();
  let best: { cat: string; n: number } | null = null;
  for (const w of wordsOf(title)) {
    const cat = learned[w];
    if (!cat || !names.has(cat)) continue;
    const n = (votes.get(cat) ?? 0) + 1;
    votes.set(cat, n);
    if (!best || n > best.n) best = { cat, n }; // first to reach the new max keeps it
  }
  return best ? best.cat : null;
}

export async function loadLearned(): Promise<LearnedMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LearnedMap) : {};
  } catch { return {}; }
}

/** Remember that this title's words map to `category` (user correction). */
export async function recordCorrection(title: string, category: string): Promise<LearnedMap> {
  const words = wordsOf(title);
  if (words.length === 0) return loadLearned();
  const map = await loadLearned();
  for (const w of words) map[w] = category;
  try { await AsyncStorage.setItem(KEY, JSON.stringify(map)); } catch { /* best-effort */ }
  return map;
}
