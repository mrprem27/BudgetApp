import type * as SQLite from 'expo-sqlite';
import { getMe, updatePersonName, insertPerson } from '../db/queries/persons';
import { getAllGroups } from '../db/queries/groups';
import { setCategoryBudgets } from '../db/queries/categoryBudgets';
import { insertTxn } from '../db/queries/transactions';
import { parseToPaise } from './money';
import { settings } from './settings';
import { GROUP_COLORS } from '../constants/palette';

/** Everything the onboarding questionnaire collects, ready to persist. */
export type OnboardingData = {
  name: string;
  incomeNum: number;
  payday: number;
  budgetNum: number;
  people: string[];
  addFirst: boolean;
};

/**
 * The next time `day`-of-month lands at/after now (9am), clamped to month
 * length. Anchors the recurring salary so it doesn't immediately back-fill.
 * Pure — `now` is injectable for tests.
 */
export function paydayAnchor(day: number, now: Date = new Date()): number {
  const y = now.getFullYear(), m = now.getMonth();
  const dimThis = new Date(y, m + 1, 0).getDate();
  let anchor = new Date(y, m, Math.min(day, dimThis), 9, 0, 0, 0);
  if (anchor.getTime() < now.getTime()) {
    const dimNext = new Date(y, m + 2, 0).getDate();
    anchor = new Date(y, m + 1, Math.min(day, dimNext), 9, 0, 0, 0);
  }
  return anchor.getTime();
}

/**
 * Single commit point for the whole questionnaire. Each piece is best-effort —
 * a failure in one (e.g. a contact) must never block finishing onboarding.
 * Returns true if it completed without a thrown error (the caller maps that to
 * a success/error haptic and always proceeds).
 */
export async function finalizeOnboarding(
  db: SQLite.SQLiteDatabase,
  data: OnboardingData,
): Promise<boolean> {
  try {
    const grps = await getAllGroups(db);
    const me = await getMe(db);
    const personal = grps.find(g => g.is_personal === 1) ?? null;

    const trimmed = data.name.trim();
    if (trimmed && me) await updatePersonName(db, me.id, trimmed);

    // Auto income recurrence — a monthly salary in Personal, anchored to pay-day.
    if (data.incomeNum > 0 && personal && me) {
      const paise = parseToPaise(String(data.incomeNum));
      await insertTxn(db, {
        groupId: personal.id, kind: 'income', entryMode: 'quick',
        date: paydayAnchor(data.payday), category: 'Salary',
        recurFreq: 'monthly', recurInterval: 1,
        payments: [{ personId: me.id, amount: paise }],
        shares: [{ personId: me.id, amount: paise }],
      });
      try { await settings.setMonthlyIncome(data.incomeNum); } catch { /* best-effort */ }
      try { await settings.setPayday(data.payday); } catch { /* best-effort */ }
    }

    // Whole monthly budget (the user's own number — no % of income).
    if (data.budgetNum > 0 && personal) {
      await setCategoryBudgets(db, personal.id, [
        { category: 'Total', cadence: 'monthly', amount: parseToPaise(String(data.budgetNum)) },
      ]);
    }

    // People to split with → contacts.
    let ci = 0;
    for (const nm of data.people) {
      const t = nm.trim();
      if (!t) continue;
      try { await insertPerson(db, t, GROUP_COLORS[ci % GROUP_COLORS.length]); ci++; } catch { /* skip one bad contact */ }
    }

    if (data.addFirst) { try { await settings.setPendingFirstAdd(true); } catch { /* best-effort */ } }
    return true;
  } catch {
    return false;
  }
}
