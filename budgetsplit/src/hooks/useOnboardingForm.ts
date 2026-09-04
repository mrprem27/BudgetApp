import { useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import * as Location from 'expo-location';
import { settings } from '../lib/settings';
import { PayMethod } from '../constants/enums';
import { haptic } from '../lib/haptics';
import { requestNotificationPermission } from '../lib/notifications';
import { setReminderPrefs } from '../lib/reminders';
import { finalizeOnboarding, type OnboardingPerson } from '../lib/onboarding';
// Re-exported so callers keep one import site; the logic is pure and lives in lib.
export { NUMBERED_STEPS, numberedSteps, stepPosition, type OnboardingStage } from '../lib/onboardingSteps';
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
  const [payday, setPayday] = useState(1);                     // day of month salary lands
  const [budgetText, setBudgetText] = useState('');            // free monthly-budget entry (rupees)
  const [cashText, setCashText] = useState('');                // total cash available (rupees)
  const [investText, setInvestText] = useState('');            // total investments (rupees)
  const [creditLimitText, setCreditLimitText] = useState('');  // credit card limit (rupees)
  const [creditUsedText, setCreditUsedText] = useState('');    // credit already used (rupees)
  const [payMethod, setPayMethod] = useState<PayMethod>(PayMethod.Upi);
  const [people, setPeople] = useState<OnboardingPerson[]>([]); // contacts added during onboarding
  const [personDraft, setPersonDraft] = useState('');
  const [personEmailDraft, setPersonEmailDraft] = useState('');
  const [notifPerm, setNotifPerm] = useState(false);
  const [locPerm, setLocPerm] = useState(false);

  /**
   * Which of the optional money figures the user actually has.
   *
   * The money step used to show all four fields to everyone, so somebody with no
   * credit card had to either type a zero into two of them or skip the screen
   * whole — including the parts that did apply to them. **A question that is
   * never asked cannot be answered wrong**, so the fields are revealed by these,
   * and un-ticking clears the figure rather than leaving it to be committed by a
   * control the user can no longer see.
   */
  const [hasInvest, setHasInvest] = useState(false);
  const [hasCredit, setHasCredit] = useState(false);

  // Plain reads, not `setX(on => …)` updaters: clearing the text is a second state
  // write, and a React updater must be pure — StrictMode invokes it twice.
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

  // The 'people' step is skipped for the personal-only persona, in both directions —
  // so Back from permissions must land on budget, not on the skipped screen.
  const afterBudget: OnboardingStage = intent === 'personal' ? 'permissions' : 'people';
  const beforePermissions: OnboardingStage = intent === 'personal' ? 'budget' : 'people';

  /**
   * Commit, then land on the summary — which reads back what was actually set
   * up. The write is one atomic `finalizeOnboarding` call; no theatrical wait.
   */
  async function finalize() {
    setSaving(true);
    const ok = await finalizeOnboarding(db, {
      intent, name, incomeNum, payday, budgetNum, people, payMethod,
      addFirst: false, // the summary's own CTA arms this explicitly
      money: {
        openingBank: toPaise(cashText),
        investments: toPaise(investText),
        creditLimit: toPaise(creditLimitText),
        creditUsed: toPaise(creditUsedText),
      },
    });
    if (ok) haptic.success(); else haptic.error();
    setCommitted(ok);
    setSaving(false);
    setStage('summary');
  }

  /**
   * Skipping the people step is an ANSWER, and it has to be recorded as one.
   *
   * Home's GET STARTED tiles key on `flags.splitting` plus a live count, so a skip
   * was invisible to them: you declined people and groups here, and the next screen
   * asked for a group again. A count cannot tell "not yet" from "no thanks".
   *
   * Best-effort on purpose — a storage fault must not block the step. The cost of
   * it failing is one tile too many, which is where we already were.
   *
   * ⚠️ Only when nothing was added. "Skip" is also the way out for someone who has
   * added three people and is done with the step — and their contacts are still
   * committed by `finalize`. Recording that as "no thanks to people and groups"
   * wrote down the opposite of what they did, and then suppressed the Home tiles on
   * the strength of it. With people present, Skip means the same as Continue.
   */
  async function skipPeople() {
    if (people.length === 0) {
      try { await settings.setOnboardingSkippedPeople(true); } catch { /* best-effort */ }
    }
    setStage('permissions');
  }

  /** Summary CTA: open Quick Add once, right after the gate opens. */
  async function finishAndAddFirst() {
    try { await settings.setPendingFirstAdd(true); } catch { /* best-effort */ }
    onDone();
  }

  /** A name is required; the email is optional and only matters for linking later. */
  function addPerson() {
    const t = personDraft.trim();
    if (!t) return;
    const email = personEmailDraft.trim();
    haptic.selection();
    setPeople(prev => (
      prev.some(p => p.name.toLowerCase() === t.toLowerCase())
        ? prev
        : [...prev, email ? { name: t, email } : { name: t }]
    ));
    setPersonDraft('');
    setPersonEmailDraft('');
  }

  function removePerson(index: number) {
    haptic.selection();
    setPeople(prev => prev.filter((_, i) => i !== index));
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
    stage, setStage, afterBudget, beforePermissions,
    // persona
    intent, setIntent,
    // fields
    name, setName, incomeText, setIncomeText, incomeNum, payday, setPayday,
    budgetText, setBudgetText, budgetNum,
    cashText, setCashText, investText, setInvestText,
    creditLimitText, setCreditLimitText, creditUsedText, setCreditUsedText,
    hasInvest, hasCredit, toggleInvest, toggleCredit,
    payMethod, setPayMethod,
    people, personDraft, setPersonDraft, personEmailDraft, setPersonEmailDraft,
    addPerson, removePerson, skipPeople,
    // permissions
    notifPerm, locPerm, allowNotifications, allowLocation,
    // commit + summary
    saving, committed, finalize, finishAndAddFirst, onDone,
  };
}
