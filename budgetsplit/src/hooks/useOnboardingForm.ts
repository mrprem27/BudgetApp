import { useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import * as Location from 'expo-location';
import { settings } from '../lib/settings';
import { PayMethod } from '../constants/enums';
import { haptic } from '../lib/haptics';
import { requestNotificationPermission } from '../lib/notifications';
import { setReminderPrefs } from '../lib/reminders';
import { finalizeOnboarding, paydayAnchor } from '../lib/onboarding';
// Re-exported so callers keep one import site; the logic is pure and lives in lib.
export { NUMBERED_STEPS, stepPosition, type OnboardingStage } from '../lib/onboardingSteps';
import type { OnboardingStage } from '../lib/onboardingSteps';
import type { OnboardingIntent } from '../lib/personaDefaults';

/**
 * The rebuilt first-run flow: every stage either asks something that visibly
 * changes the app, or (summary) shows exactly what the answers changed. The
 * feature carousel (asked nothing, changed nothing), the forward-only payoff
 * beat and the fake 1.7s "committing" checklist are gone — the write is a fast
 * local SQLite transaction and pretending otherwise was theatre.
 */
/** rupees text → integer paise (0 when blank or unparseable). */
function toPaise(t: string): number {
  return Math.max(0, Math.round((Number(t.replace(/[^0-9.]/g, '')) || 0) * 100));
}

/** rupees text → whole rupees (0 when blank or unparseable). */
function toRupees(t: string): number {
  return Math.max(0, Math.round(Number(t.replace(/[^0-9.]/g, '')) || 0));
}

/**
 * All of the onboarding questionnaire's state, stage machine and commit — so the
 * screen is render-only, matching `useAddTxnForm` / `useItemizedForm` (AUDIT DEBT-12).
 */
export function useOnboardingForm({ onDone }: { onDone: () => void }) {
  const db = useSQLiteContext();

  const [stage, setStage] = useState<OnboardingStage>('hero');
  const [intent, setIntent] = useState<OnboardingIntent>('both');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [committed, setCommitted] = useState(false);           // finalize succeeded
  const [incomeText, setIncomeText] = useState('');            // free take-home entry (rupees)
  // The exact date the next paycheque lands, defaulted to today at local
  // midnight — `paydayAnchor` floors it, `DatePickerSheet.pick` preserves
  // whatever time-of-day it's given, so this is the one place that has to get
  // midnight right for every later pick to inherit it.
  const [firstPayDate, setFirstPayDate] = useState(() => paydayAnchor(Date.now()));
  const [showPayDateSheet, setShowPayDateSheet] = useState(false); // the payday step's DatePickerSheet
  const [budgetText, setBudgetText] = useState('');            // free monthly-budget entry (rupees)
  const [bankText, setBankText] = useState('');                 // bank balance (rupees)
  const [cashText, setCashText] = useState('');                 // cash in hand (rupees)
  const [walletText, setWalletText] = useState('');              // wallet balance (rupees)
  const [investText, setInvestText] = useState('');             // total investments (rupees)
  const [creditLimitText, setCreditLimitText] = useState('');   // credit card limit (rupees)
  const [creditUsedText, setCreditUsedText] = useState('');     // credit already used (rupees)
  const [payMethod, setPayMethod] = useState<PayMethod>(PayMethod.Upi);
  const [notifPerm, setNotifPerm] = useState(false);
  const [locPerm, setLocPerm] = useState(false);

  /**
   * Which of the four EXTRA money figures the user actually has, beyond cash.
   *
   * Cash available stays the one open hero field (`StepAmountField`) — asking
   * five things up front, all behind picks, turned out to be more friction
   * than the four-field version it replaced, not less (`DQ-88`-adjacent
   * feedback while building `SPEC-2026-09-FEEDBACK.md` §2 O5: "I think its a friction to ask
   * everything on onboarding"). Bank/Wallet/Investments/Credit stay behind
   * picks: **a question that is never asked cannot be answered wrong**, so a
   * figure's field is revealed only by ticking it, and un-ticking clears what
   * was typed rather than leaving it to be committed by a control the user
   * can no longer see.
   */
  const [hasBank, setHasBank] = useState(false);
  const [hasWallet, setHasWallet] = useState(false);
  const [hasInvest, setHasInvest] = useState(false);
  const [hasCredit, setHasCredit] = useState(false);

  // Plain reads, not `setX(on => …)` updaters: clearing the text is a second state
  // write, and a React updater must be pure — StrictMode invokes it twice.
  function toggleBank() {
    haptic.selection();
    if (hasBank) setBankText('');
    setHasBank(!hasBank);
  }

  function toggleWallet() {
    haptic.selection();
    if (hasWallet) setWalletText('');
    setHasWallet(!hasWallet);
  }

  function toggleInvest() {
    haptic.selection();
    if (hasInvest) setInvestText('');
    setHasInvest(!hasInvest);
  }

  function toggleCredit() {
    haptic.selection();
    if (hasCredit) { setCreditLimitText(''); setCreditUsedText(''); }
    setHasCredit(!hasCredit);
  }

  // Parsed numeric views of the free-text amounts (0 when blank/invalid).
  const incomeNum = toRupees(incomeText);
  const budgetNum = toRupees(budgetText);

  /**
   * Commit, then land on the summary — which reads back what was actually set
   * up. The write is one atomic `finalizeOnboarding` call; no theatrical wait.
   */
  async function finalize() {
    setSaving(true);
    const ok = await finalizeOnboarding(db, {
      intent, name, incomeNum, firstPayDate, budgetNum, payMethod,
      addFirst: false, // the summary's own CTA arms this explicitly
      money: {
        // Cash is the one always-asked figure, like the field it replaces —
        // unconditional, same as before this pass.
        openingCash: toPaise(cashText),
        // `undefined`, not 0, for anything never ticked — the same "never
        // asked, never answered wrong" rule `hasBank`/etc. exist to enforce,
        // carried through to what actually gets written. `setMoneyProfileRows`
        // skips a key exactly when it's `undefined` (`moneyProfile.ts`).
        openingBank: hasBank ? toPaise(bankText) : undefined,
        openingWallet: hasWallet ? toPaise(walletText) : undefined,
        investments: hasInvest ? toPaise(investText) : 0,
        creditLimit: hasCredit ? toPaise(creditLimitText) : undefined,
        creditUsed: hasCredit ? toPaise(creditUsedText) : undefined,
      },
    });
    if (ok) haptic.success(); else haptic.error();
    setCommitted(ok);
    setSaving(false);
    setStage('summary');
  }

  /** Summary CTA: open Quick Add once, right after the gate opens. */
  async function finishAndAddFirst() {
    try { await settings.setPendingFirstAdd(true); } catch { /* best-effort */ }
    onDone();
  }

  async function allowNotifications() {
    haptic.selection();
    const ok = await requestNotificationPermission();
    setNotifPerm(ok);
    if (ok) { try { await setReminderPrefs({ renewals: true }); } catch { /* best-effort */ } }
  }

  async function allowLocation() {
    haptic.selection();
    const { status } = await Location.requestForegroundPermissionsAsync();
    const ok = status === 'granted';
    setLocPerm(ok);
    if (ok) { try { await settings.setSaveLocation(true); } catch { /* best-effort */ } }
  }

  return {
    // stage machine
    stage, setStage,
    // persona
    intent, setIntent,
    // fields
    name, setName, incomeText, setIncomeText, incomeNum, firstPayDate, setFirstPayDate,
    showPayDateSheet, setShowPayDateSheet,
    budgetText, setBudgetText, budgetNum,
    bankText, setBankText, cashText, setCashText, walletText, setWalletText,
    investText, setInvestText,
    creditLimitText, setCreditLimitText, creditUsedText, setCreditUsedText,
    hasBank, hasWallet, hasInvest, hasCredit,
    toggleBank, toggleWallet, toggleInvest, toggleCredit,
    payMethod, setPayMethod,
    // permissions
    notifPerm, locPerm, allowNotifications, allowLocation,
    // commit + summary
    saving, committed, finalize, finishAndAddFirst, onDone,
  };
}
