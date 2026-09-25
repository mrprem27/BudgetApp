import type * as SQLite from 'expo-sqlite';
import { getMe, updatePersonName } from '../db/queries/persons';
import { getAllGroups, personalGroupOf } from '../db/queries/groups';
import { insertTxn } from '../db/queries/transactions';
import { setMoneyProfile } from '../db/queries/moneyProfile';
import { parseToPaise } from './money';
import { settings } from './settings';
import type { PayMethod } from '../constants/enums';
import { setReminderPrefs } from './reminderPrefsStore';
import { applyPersona, type OnboardingIntent } from './personaDefaults';
import { insertAsset } from '../db/queries/assets';

/** Everything the onboarding questionnaire collects, ready to persist. */
export type OnboardingData = {
  intent: OnboardingIntent;
  name: string;
  incomeNum: number;
  /** The exact date the next paycheque lands, epoch ms — not a day-of-month.
   *  Only meaningful (only used) when `incomeNum > 0`. */
  firstPayDate: number;
  budgetNum: number;
  addFirst: boolean;
  /** How this user usually pays — seeds the Add screen's chip. */
  payMethod: PayMethod;
  /**
   * Opening money position, already in integer paise. `openingCash` is the
   * one always-asked figure — cash is still the money step's hero field, as
   * it was before `SPEC-2026-09-FEEDBACK.md` §2 O5 (five figures all behind a pick tried, and
   * cut on your call: more friction than the field it replaced, not less).
   * The rest are genuinely optional — `undefined`, not 0, for anything the
   * user never ticked. `investments` is the exception even among those,
   * always a definite number: it never reaches `setMoneyProfile` (see below),
   * so its own `> 0` check downstream is what "never ticked" means for it.
   */
  money: {
    openingBank?: number;
    openingCash?: number;
    openingWallet?: number;
    investments: number;
    creditLimit?: number;
    creditUsed?: number;
  };
};

/**
 * Floors a chosen date to local midnight.
 *
 * Used to compute a "next occurrence of this day-of-month" from `now` —
 * there was no date to ask for, only a day, so the next occurrence had to be
 * derived, and it landed at 09:00 for no stated reason. `SPEC-2026-09-FEEDBACK.md` §2 O4
 * replaced the day-of-month picker with `DatePickerSheet` (`minDate` = today,
 * so the user can no longer name a day that has already passed this month
 * the way the old grid could), which means there is no "next occurrence" left
 * to compute — the user already pointed at the exact date. What's left is
 * normalising it to the stated default time, **12:00 AM**, defensively:
 * `DatePickerSheet.pick` preserves whatever time-of-day was already in the
 * value it was given, so this is what guarantees that value was midnight in
 * the first place, at the one place it's written. Pure — takes the picked
 * date rather than "now".
 */
export function paydayAnchor(dateMs: number): number {
  const d = new Date(dateMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
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

    // Auto income recurrence — a monthly salary in Personal, dated to the exact
    // next-payment date the user picked.
    if (data.incomeNum > 0 && personal && me) {
      const paise = parseToPaise(String(data.incomeNum));
      await insertTxn(db, {
        groupId: personal.id, kind: 'income', entryMode: 'quick',
        date: paydayAnchor(data.firstPayDate), category: 'Salary',
        recurFreq: 'monthly', recurInterval: 1,
        payments: [{ personId: me.id, amount: paise }],
        shares: [{ personId: me.id, amount: paise }],
      });
      // The income figure and pay-day are NOT stored as preferences. Both used to
      // be, and nothing ever read either one. The salary rule above is the real
      // record of both: its amount is the income, and `paydayAnchor(data.firstPayDate)`
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

    // Who you split with is a Friends question now, not an onboarding one
    // (`SPEC-2026-09-FEEDBACK.md` §2 O6) — this used to insert contacts from a `people` step
    // that no longer exists.

    // The backup nudge defaults ON (V2-02): with no sync, a lost phone is total
    // data loss, and a user who skipped the notifications toggle was never even
    // reminded. The reminder itself still respects the OS permission.
    try { await setReminderPrefs({ backup: true }); } catch { /* best-effort */ }

    // Opening money position (bank / cash / wallet / credit). `investments`
    // pulled out explicitly rather than passed through: `MoneyProfileWrite`
    // omits it on purpose (a write there would be a second source of truth
    // for a figure the asset register already owns), and passing it anyway
    // previously worked only because `data.money` is a variable rather than
    // an object literal, which excess-property checking does not see through.
    const { investments: _investments, ...profile } = data.money;
    try { await setMoneyProfile(db, profile); } catch { /* best-effort */ }

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
      } catch {
        /*
         * NOT swallowed like its cash/credit sibling above, and the difference
         * matters: those land in `settings`, which has other writers and a visible
         * editor. This number has no other record anywhere, so a silent failure
         * loses it outright. Falling back to the old key means the launch
         * invariant converts it on the very next start.
         */
        try { await db.runAsync(
          "INSERT OR REPLACE INTO settings (key, value) VALUES ('money.investments', ?)",
          [String(Math.round(data.money.investments))],
        ); } catch { /* genuinely nothing left to try */ }
      }
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
