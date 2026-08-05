import type * as SQLite from 'expo-sqlite';
import { getMe, updatePersonName, insertPerson } from '../db/queries/persons';
import { getAllGroups } from '../db/queries/groups';
import { setCategoryBudgets } from '../db/queries/categoryBudgets';
import { insertTxn } from '../db/queries/transactions';
import { setMoneyProfile } from '../db/queries/moneyProfile';
import { parseToPaise } from './money';
import { settings } from './settings';
import { applyPersona, type OnboardingIntent } from './personaDefaults';
import { GROUP_COLORS } from '../constants/palette';

/** Everything the onboarding questionnaire collects, ready to persist. */
export type OnboardingData = {
  intent: OnboardingIntent;
  name: string;
  incomeNum: number;
  payday: number;
  budgetNum: number;
  people: string[];
  addFirst: boolean;
  /** Opening money position, already in integer paise. */
  money: {
    openingCash: number;
    investments: number;
    creditLimit: number;
    creditUsed: number;
  };
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
 *
 * "Single" is literal: the money profile used to be written by a second call in the
 * screen, so "what does onboarding persist?" needed two files to answer (DEBT-12).
 */
export async function finalizeOnboarding(
  db: SQLite.SQLiteDatabase,
  data: OnboardingData,
): Promise<boolean> {
  // The persona, and the feature flags it implies. First, because it decides which
  // app the user lands in and it must survive a failure further down.
  try {
    await applyPersona(data.intent);
  } catch { /* the app still works on DEFAULTS */ }

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
      // The income figure and pay-day are NOT stored as preferences. Both used to
      // be, and nothing ever read either one. The salary rule above is the real
      // record of both: its amount is the income, and `paydayAnchor(data.payday)`
      // is the pay-day. The afford engine derives monthly income from the last 30
      // days of income transactions (queries/savings.ts), which tracks what
      // actually happens rather than a number typed once during setup.
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

    // Opening money position (cash / investments / credit).
    try { await setMoneyProfile(db, data.money); } catch { /* best-effort */ }

    if (data.addFirst) { try { await settings.setPendingFirstAdd(true); } catch { /* best-effort */ } }
    return true;
  } catch {
    return false;
  }
}
