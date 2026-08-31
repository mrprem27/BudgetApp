import type * as SQLite from 'expo-sqlite';
import { getMe, updatePersonName, insertPerson } from '../db/queries/persons';
import { getAllGroups, personalGroupOf, insertGroup } from '../db/queries/groups';
import { insertTxn } from '../db/queries/transactions';
import { setMoneyProfile } from '../db/queries/moneyProfile';
import { parseToPaise } from './money';
import { settings } from './settings';
import type { PayMethod } from '../constants/enums';
import { setReminderPrefs } from './reminderPrefsStore';
import { applyPersona, type OnboardingIntent } from './personaDefaults';
import { GROUP_COLORS } from '../constants/palette';
import { insertAsset } from '../db/queries/assets';

/** Everything the onboarding questionnaire collects, ready to persist. */
export type OnboardingData = {
  intent: OnboardingIntent;
  name: string;
  incomeNum: number;
  payday: number;
  budgetNum: number;
  people: string[];
  /** Group to create from `people` (name chosen on the people step). Null/empty
   *  people → no group. This is what makes the Groups tab non-empty on landing
   *  instead of "No groups yet" for the very persona that added flatmates. */
  groupName: string | null;
  addFirst: boolean;
  /** How this user usually pays — seeds the Add screen's chip. */
  payMethod: PayMethod;
  /** Opening money position, already in integer paise. */
  money: {
    /**
     * The single figure the money step asks for. It lands in **bank**, not
     * cash-in-hand: the question is "what do you have right now", which for almost
     * everyone is an account balance — and `INCOME_LANDING_DEFAULT` is Bank for the
     * same reason. Cash and wallet start at zero and are set in Plan → Your money.
     */
    openingBank: number;
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

  // Arm the Scan & Pay coach mark for this user's first visit to Home. Its own try:
  // a persona write failing has nothing to do with whether the hint should show.
  // Only new users get it — an existing install has no business being taught a
  // gesture it may already use, and the hint would otherwise sit on Home forever
  // for anyone who never long-pressed.
  try { await settings.setScanPayHintPending(true); } catch { /* best-effort */ }

  try {
    const grps = await getAllGroups(db);
    const me = await getMe(db);
    const personal = personalGroupOf(grps);

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

    // The whole-month figure is kept as a suggestion, not written as a budget: it
    // has no category, and inventing one ('Total') put a phantom Others row on
    // Personal and offered "Total" for adoption in the editor.
    if (data.budgetNum > 0) {
      try { await settings.setBudgetTarget(parseToPaise(String(data.budgetNum))); } catch { /* best-effort */ }
    }

    // People to split with → contacts, then a REAL group holding them. The old
    // flow inserted persons and stopped, so the Groups tab still said "No
    // groups yet" to the very user who just listed their flatmates.
    let ci = 0;
    const personIds: string[] = [];
    for (const nm of data.people) {
      const t = nm.trim();
      if (!t) continue;
      try {
        const p = await insertPerson(db, t, GROUP_COLORS[ci % GROUP_COLORS.length]);
        personIds.push(p.id);
        ci++;
      } catch { /* skip one bad contact */ }
    }
    if (personIds.length > 0 && me) {
      const gname = (data.groupName ?? '').trim() || 'Friends';
      const icon = gname === 'Home' ? 'home' : gname === 'Trip' ? 'map' : 'users';
      try {
        await insertGroup(db, gname, icon, GROUP_COLORS[0], [me.id, ...personIds]);
      } catch { /* contacts still exist; a group can be made later */ }
    }

    // The backup nudge defaults ON (V2-02): with no sync, a lost phone is total
    // data loss, and a user who skipped the notifications toggle was never even
    // reminded. The reminder itself still respects the OS permission.
    try { await setReminderPrefs({ backup: true }); } catch { /* best-effort */ }

    // Opening money position (cash / credit).
    try { await setMoneyProfile(db, data.money); } catch { /* best-effort */ }

    /*
     * Investments are a NAMED asset now, so the onboarding answer becomes the
     * user's first asset rather than a number in `settings`.
     *
     * This is written separately and deliberately: `setMoneyProfile` no longer
     * accepts `investments`, and because `data.money` is a variable rather than an
     * object literal TypeScript does NOT flag the extra property — so without this
     * the figure someone typed during setup would silently do nothing, and their
     * net worth would open short by exactly that amount.
     */
    if (data.money.investments > 0) {
      try {
        await insertAsset(db, {
          name: 'Investments', kind: 'investment', icon: 'trending-up',
          balance: data.money.investments,
        });
      } catch { /* best-effort */ }
    }

    // A capture default only: it seeds the Add screen's pay-method chip and never
    // touches the money model.
    try { await settings.setDefaultPayMethod(data.payMethod); } catch { /* best-effort */ }

    if (data.addFirst) { try { await settings.setPendingFirstAdd(true); } catch { /* best-effort */ } }
    return true;
  } catch {
    return false;
  }
}
