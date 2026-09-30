import type * as SQLite from 'expo-sqlite';
import { getTxnById, type TxnWithSplits } from '../db/queries/transactions';
import { getSkipsMap, getAllRecurringRules } from '../db/queries/recurring';
import { getMe } from '../db/queries/persons';
import { nextUnskippedOccurrence } from './recurrence';
import { myShareOrTotal, myIncomeOf, txnTotal } from './splitMath';
import type { RecurFreq, TxnKind } from '../constants/enums';
import { getGroupById } from '../db/queries/groups';

/**
 * One recurring rule for its screen. A deleted rule is not found: a "this &
 * future" edit that supersedes a rule deletes it, and it rendered here as a live
 * rule with Pause and Skip still on offer.
 */
export async function loadRecurringRule(db: SQLite.SQLiteDatabase, id: string) {
  const found = await getTxnById(db, id);
  const rule = found && found.is_deleted === 0 && found.recur_freq ? found : null;
  if (!rule) return { rule: null, skips: undefined, groupName: null };
  const [skipMap, group] = await Promise.all([getSkipsMap(db, [rule.id]), getGroupById(db, rule.group_id)]);
  return {
    rule,
    skips: skipMap.get(rule.id),
    groupName: group && group.is_personal !== 1 ? group.name : null,
  };
}

/** One row of the Recurring inventory. */
export type RecurringSub = { id: string; groupId: string; name: string; category: string; kind: TxnKind; amount: number; freq: RecurFreq; interval: number | null; nextMs: number | null; paused: boolean };

/**
 * The recurring inventory — one row per rule, in every group that still has me.
 * Archived groups count: their rules still post (`getAllRecurringRules`).
 */
export async function loadRecurringInventory(db: SQLite.SQLiteDatabase): Promise<RecurringSub[]> {
  const byGroup = await getAllRecurringRules(db);
  // Every kind: recurring income (salary) belongs on this screen too — it was
  // invisible everywhere until it first materialized, which made onboarding's
  // income answer look like it did nothing.
  /*
   * Paused rules are IN this list, and that is the whole point of the screen.
   *
   * They were filtered out while the row offered a Pause button and no Resume
   * anywhere in the app — so Pause removed the rule from the only screen that
   * lists it, permanently, with no undo. The screen's own docblock says
   * a paused rule "belongs here and nowhere else"; the filter contradicted it.
   */
  const rules = byGroup.filter(t =>
    t.recur_freq
    && t.recur_state !== 'ended'
    /*
     * NOT a rule somebody else proposed and I have not accepted.
     *
     * `getRecurringForGroup` deliberately includes pending peer rules, and every
     * other consumer filters them (`lib/upcoming.ts:125`, `expandUpcoming:46`).
     * This one did not — so a flatmate's proposed "Gym ₹12,000/mo" added ₹4,000
     * to my committed total the moment they typed it, before I had agreed to
     * anything, and appeared in no upcoming list to explain where it came from.
     * The place to decide about a peer's rule is the approvals queue.
     */
    && !t.pendingApproval);
  // Skips have to be loaded, not inferred: "next" must be the next date that actually
  // happens, not the next one the schedule would produce.
  const skips = await getSkipsMap(db, rules.map(r => r.id));
  const meRow = await getMe(db);
  return toRecurringSubs(rules, skips, meRow?.id ?? null, Date.now());
}

/**
 * Rules as the rows the inventory shows — pure, so Money's Recurring and a group's Recurring tab
 * build the same rows from the same rules (`U-38`).
 */
export function toRecurringSubs(
  rules: TxnWithSplits[], skips: Map<string, Set<number>> | undefined, meId: string | null, now: number,
): RecurringSub[] {
  const list: RecurringSub[] = rules.map(t => ({
    id: t.id,
    groupId: t.group_id,
    name: (t.note && t.note.trim()) || t.category,
    category: t.category,
    kind: t.kind,
    // My share — the only basis that sums honestly with budgets and afford.
    // Income is attributed by payments, so it reads the other side.
    amount: meId
      ? (t.kind === 'income' ? myIncomeOf(t, meId) : myShareOrTotal(t, meId))
      : txnTotal(t),
    freq: t.recur_freq!,
    interval: t.recur_interval,
    // A paused rule has no next charge — `materializeDueOccurrences` filters on
    // `recur_state = 'active'` — so showing the schedule's next date would
    // advertise a charge that will not happen.
    nextMs: t.recur_state === 'paused' ? null : nextUnskippedOccurrence(t, now, skips?.get(t.id)),
    paused: t.recur_state === 'paused',
  }));
  // Paused rules sink below the live ones: they are here to be found and
  // resumed, not to lead a list of what is about to be charged.
  list.sort((a, b) =>
    Number(a.paused) - Number(b.paused) || (a.nextMs ?? Infinity) - (b.nextMs ?? Infinity));
  return list;
}
