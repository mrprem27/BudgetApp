import type * as SQLite from 'expo-sqlite';
import { startOfMonth } from 'date-fns';
import { getTransactionsInRange, type TxnWithSplits } from '../db/queries/transactions';
import { getMe, getAllPersons } from '../db/queries/persons';
import { getAllGroups, getArchivedGroups } from '../db/queries/groups';
import { applyFilters, type KindFilter } from './txnFilter';
import { monthLabel } from './dateFormat';
import { txnTotal } from './splitMath';
import type { SearchSource } from '../constants/enums';

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
/** How far back Search reaches. */
const LOOKBACK_MS = 3 * YEAR_MS;
/**
 * And forward: an entry dated ahead — a bill logged before it is due — is still
 * one you may be looking for. The window stopped at now, so it could never be found.
 */
const LOOKAHEAD_MS = 5 * YEAR_MS;
const SECTION_CAP = 6;

type MoreRow = { _more: true; section: string; count: number; monthName: string };
export type SearchRow = TxnWithSplits | MoreRow;
type MonthSection = { title: string; data: SearchRow[] };
export const isMore = (r: SearchRow): r is MoreRow => (r as MoreRow)._more === true;

/** Everything Search filters over, loaded once per visit. */
export async function loadSearchData(db: SQLite.SQLiteDatabase) {
  const now = Date.now();
  const [txns, me, live, archived, persons] = await Promise.all([
    getTransactionsInRange(db, null, now - LOOKBACK_MS, now + LOOKAHEAD_MS),
    getMe(db),
    getAllGroups(db),
    // Named too: their entries are in the results, and a row with no group name
    // reads as Personal.
    getArchivedGroups(db),
    getAllPersons(db),
  ]);
  const grps = [...live, ...archived];
  return {
    all: txns,
    myId: me?.id ?? '',
    personalGroupId: grps.find(g => g.is_personal === 1)?.id ?? '',
    groupNames: Object.fromEntries(grps.map(g => [g.id, g.name])) as Record<string, string>,
    // Everyone, so the person chip can narrow to any of them. `me` included —
    // "only the ones I'm on" is a real question on a screen spanning every group.
    people: persons.map(x => ({ id: x.id, name: x.name })),
  };
}

export type SearchFilters = {
  query: string; kind: KindFilter; from: number | null; to: number | null; personId: string | null;
  tags?: readonly string[];
  source: SearchSource; personalGroupId: string; expanded: Set<string>;
};

/** The filtered results, in month sections, with a total for a single selected kind. */
export function searchResults(
  all: TxnWithSplits[],
  { query, kind, from, to, personId, tags, source, personalGroupId, expanded }: SearchFilters,
): { sections: MonthSection[]; totalCount: number; totalAmount: number } {
  /*
   * Kind, text, date range and person come from `lib/txnFilter.ts` — the same
   * predicate the Personal ledger and the group ledger now run, so a word that
   * finds a row here finds it there too. This screen's haystack was the widest of
   * the three and became the shared one: tags and both spellings of the amount
   * are folded in, because someone hunting a row types whatever they remember
   * about it rather than reaching for the right control first.
   *
   * `source` stays local: it is not a property of a transaction, it is which
   * ledger you are looking at.
   */
  const filtered = applyFilters(all, { query, kind, from, to, personId, tags })
    .filter(t => {
      if (source === 'personal' && personalGroupId && t.group_id !== personalGroupId) return false;
      if (source === 'groups' && personalGroupId && t.group_id === personalGroupId) return false;
      return true;
    });

  /*
   * Grouped by `date` — WHEN IT HAPPENED — like every other ledger surface.
   *
   * This grouped by `created_at`, the moment the row was written, while the
   * query that produced these rows both filters and orders by `date`. Three
   * things went wrong at once: a bill dated in March but entered today sat
   * under SEPTEMBER here and under March everywhere else, so searching for it
   * found it in the wrong place; rows inside a section arrived in `date` order
   * under a header derived from a different column, so a section could read out
   * of order against itself; and an imported statement, whose rows are all
   * created within the same minute, collapsed three years of history into one
   * month.
   */
  const map = new Map<string, TxnWithSplits[]>();
  for (const t of filtered) {
    const d = new Date(t.date);
    const key = isFinite(d.getTime()) ? monthLabel(startOfMonth(d)).toUpperCase() : 'OLDER';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }

  // Cap each month at SECTION_CAP rows unless expanded; overflow collapses into a
  // "+ N more in {month}" row.
  const secs: MonthSection[] = Array.from(map.entries()).map(([title, rows]) => {
    if (rows.length > SECTION_CAP && !expanded.has(title)) {
      const monthName = title.split(' ')[0];
      return {
        title,
        data: [...rows.slice(0, SECTION_CAP), { _more: true as const, section: title, count: rows.length - SECTION_CAP, monthName }] as SearchRow[],
      };
    }
    return { title, data: rows };
  });
  // Summed for the SELECTED kind only. It used to sum expenses whatever was listed, so
  // "24 results · ₹12,400 total" was measuring something other than the 24 rows above it
  // — and on "All" a single figure across money-in, money-out and settlements answers no
  // question at all, so there is none.
  const totalAmt = kind === 'all'
    ? 0
    : filtered.reduce((s, t) => s + txnTotal(t), 0);
  return { sections: secs, totalCount: filtered.length, totalAmount: totalAmt };
}
