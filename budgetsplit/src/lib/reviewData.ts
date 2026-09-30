import type * as SQLite from 'expo-sqlite';
import { getPending, updatePendingDraft, type PendingDraft } from '../db/queries/pending';
import { convertToRecurring } from '../db/queries/recurring';
import { getMe, getGroupMembers, type Person } from '../db/queries/persons';
import { getAllGroups } from '../db/queries/groups';
import { getCategoriesByFrequency } from '../db/queries/categories';
import { openConflicts } from '../db/queries/syncConflicts';
import type { RecurringCandidate } from './recurringSuggest';

/** The inbox: pending imports, the catalogs and members each row can be filed against, and open conflicts. */
export async function loadReview(db: SQLite.SQLiteDatabase) {
  const [me, groups] = await Promise.all([getMe(db), getAllGroups(db)]);
  const personalId = groups.find(g => g.is_personal === 1)?.id ?? groups[0]?.id ?? '';
  // A pending row can only be assigned to an active shared group.
  const shared = groups.filter(g => g.is_personal !== 1 && g.is_archived !== 1);
  const [conflicts, pending, expenseCats, incomeCats, transferCats, ...memberLists] = await Promise.all([
    openConflicts(db),
    getPending(db),
    getCategoriesByFrequency(db, personalId, 'expense'),
    getCategoriesByFrequency(db, personalId, 'income'),
    getCategoriesByFrequency(db, personalId, 'transfer'),
    ...shared.map(g => getGroupMembers(db, g.id)),
  ]);
  const groupMembers: Record<string, Person[]> = {};
  shared.forEach((g, i) => { groupMembers[g.id] = memberLists[i] as Person[]; });
  return {
    conflicts: conflicts.map(c => c.txnId),
    pending, meId: me?.id ?? '', personalId,
    sharedGroups: shared.map(g => ({ id: g.id, name: g.name, icon: g.icon, color: g.color })),
    groupMembers, expenseCats, incomeCats, transferCats,
  };
}

/**
 * Auto-save an edit to a pending row. Fire-and-forget on purpose — it runs on
 * every keystroke-scale change and must never block the UI — and it can lose the
 * draft if the write fails, which the next edit or the save itself repairs.
 */
export function saveDraft(db: SQLite.SQLiteDatabase, id: string, draft: PendingDraft): void {
  updatePendingDraft(db, id, draft).catch(() => {});
}

/** Turn the chosen suggestions into monthly rules. One that fails must not stop the rest. */
export async function convertSuggestions(db: SQLite.SQLiteDatabase, chosen: RecurringCandidate[]): Promise<void> {
  for (const c of chosen) await convertToRecurring(db, c.mostRecentTxnId, 'monthly', 1).catch(() => {});
}
