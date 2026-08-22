import { useState, useEffect, useMemo, useRef } from 'react';
import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { nthOccurrenceMs, normalizeRecurrence } from '../lib/recurrence';
import { settings } from '../lib/settings';
import { matchCategory } from '../lib/smartCategory';
import { loadLearned, learnedMatch, recordCorrection, type LearnedMap } from '../lib/smartCategoryLearn';
import { DEFAULT_CURRENCY, type CurrencyCode } from '../constants/currencies';
import { getAllGroups, getGroupById, getGroupsByRecentUse } from '../db/queries/groups';
import { getGroupMembers, getMe, getAllPersons } from '../db/queries/persons';
import { getFriendBalances } from '../db/queries/balances';
import { computeTransferScopes, planAllGroupsSettlement, type TransferScopes } from '../lib/settleScope';
import { getCategoriesByFrequency, type CategoryKind } from '../db/queries/categories';
import { insertTxn, updateTxn, getTxnById, findRecentDuplicate, recordSettlement } from '../db/queries/transactions';
import { splitRecurringSeries } from '../db/queries/recurring';
import { parseTags } from '../lib/tags';
import { deleteAttachment } from '../lib/attachment';
import { parseToPaise, formatRupees, paiseToInput } from '../lib/money';
import { computeShares as calcShares, computePayments as calcPayments, validateShares } from '../lib/splitMath';
import { getAffordSnapshot, type AffordSnapshot } from '../db/queries/savings';
import { evaluateAfford } from '../lib/afford';
import { haptic } from '../lib/haptics';
import { saveFailureMessage } from '../lib/dbErrors';
import { composeTitleNote } from '../lib/txnNote';
import { useFeatureFlags } from '../components/system/FeatureFlagsProvider';
import { useDataRefresh } from '../components/system/DataRefreshProvider';
import { useToast } from '../components/system/Toast';
import { getSafeToSpend } from '../db/queries/spendPower';
import { setPendingSettlement } from '../lib/pendingSettlement';
import { useStore } from '../store';
import { useLocationCapture } from './useLocationCapture';
import { useUpiHandoff } from './useUpiHandoff';
import { buildUpiUri, buildUpiRequestUri } from '../lib/upiIntent';
import type { BudgetGroup } from '../db/queries/groups';
import type { Person } from '../db/queries/persons';
import type { Category } from '../db/queries/categories';
import { AddKind, PayMethod, RecurEndMode, INCOME_LANDING_DEFAULT, TRANSFER_SCOPE_ALL, asPayMethod, type TransferScope , defaultRecurMode, type RecurMode } from '../constants/enums';
import type { SplitMode, RecurFreq } from '../constants/enums';

export type AddTxnParams = {
  groupId?: string; kind?: string; editId?: string; recurEditId?: string;
  from?: string; to?: string; amount?: string; note?: string; date?: string; category?: string;
};

/**
 * The entire Add-transaction form: state, category/member loading, edit hydration,
 * transfer scopes, split/payer math, and the save paths (expense/income insert +
 * update + recurring split + settlement). Extracted from app/add/quick.tsx so that
 * screen is a thin composer (AGENTS "screen thinness"). Behavior is unchanged.
 */
export function useAddTxnForm(params: AddTxnParams) {
  const {
    groupId: paramGroupId, kind: paramKind, editId, recurEditId,
    from: paramFrom, to: paramTo, amount: paramAmount, note: paramNote, date: paramDate, category: paramCategory,
  } = params;
  const isEditing = !!editId;
  const isRecurEdit = !!recurEditId;
  const db = useSQLiteContext();
  const router = useRouter();
  const { flags } = useFeatureFlags();
  const { refresh } = useDataRefresh();
  const { showToast } = useToast();

  // groups + me come from the hydrated zustand store (single source of truth).
  // The mount effect below has a cold-start query fallback for the first-ever open
  // before hydration completes, so initial group selection + payer seeding are safe.
  const groups = useStore(s => s.groups);
  const me = useStore(s => s.me);
  const [selectedGroupId, setSelectedGroupId] = useState(paramGroupId ?? '');
  const [kind, setKind] = useState<AddKind>(
    paramKind === AddKind.Income ? AddKind.Income : paramKind === AddKind.Transfer ? AddKind.Transfer : AddKind.Expense,
  );
  const [amountText, setAmountText] = useState(paramAmount && /^\d+$/.test(paramAmount) ? paiseToInput(parseInt(paramAmount, 10)) : '');
  const [allPersons, setAllPersons] = useState<Person[]>([]);
  const [personNet, setPersonNet] = useState<Record<string, number>>({});
  const [transferFromId, setTransferFromId] = useState(paramFrom ?? '');
  const [transferToId, setTransferToId] = useState(paramTo ?? '');
  /**
   * A new transfer always starts at **All groups**, even when the screen was opened from inside
   * a group.
   *
   * It used to seed from `paramGroupId`, which quietly narrowed the settlement to the group you
   * happened to arrive from — so paying someone back cleared only that group's share of what
   * you owed them, and the rest stayed outstanding with nothing on screen saying so. Settling
   * up is a debt between two people; which group the debt arose in is a detail.
   *
   * Editing an existing settlement still adopts that transaction's group further down — that
   * is showing a stored fact, not choosing a default.
   */
  const [transferScope, setTransferScope] = useState<TransferScope>(TRANSFER_SCOPE_ALL);
  const [transferScopes, setTransferScopes] = useState<TransferScopes | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>(PayMethod.Upi);  // Seeded from the user's default in the settings effect below.
  const [transferNote, setTransferNote] = useState('');
  const [note, setNote] = useState(typeof paramNote === 'string' ? paramNote : '');
  const [title, setTitle] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [catManual, setCatManual] = useState(false);
  const [learned, setLearned] = useState<LearnedMap>({});
  const [members, setMembers] = useState<Person[]>([]);
  // The store's `groups` is creation-ordered (it hydrates from `getAllGroups`) and
  // is shared app-wide, so it isn't the place to impose a picker's ordering. The
  // destination picker wants most-recently-used first, so it gets its own read.
  const [pickerGroups, setPickerGroups] = useState<BudgetGroup[]>([]);
  const [txnDate, setTxnDate] = useState(paramDate && /^\d+$/.test(paramDate) ? parseInt(paramDate, 10) : Date.now());
  const [splitType, setSplitType] = useState<SplitMode>('equal');
  const [splitMembers, setSplitMembers] = useState<string[]>([]);
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [percentages, setPercentages] = useState<Record<string, string>>({});
  const [ratios, setRatios] = useState<Record<string, string>>({});
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [attachmentUri, setAttachmentUri] = useState<string | null>(null);
  // The receipt this transaction had *before* any edit-mode change, captured once
  // at load. Replacing or removing it overwrites `attachmentUri` itself, so
  // without this the old file's path is gone by save time and never unlinked.
  // A ref, not state — nothing should re-render off it. Mirrors `useItemizedForm`.
  const originalAttachmentUriRef = useRef<string | null>(null);
  /** Free-form tags — the axis categories can't express (needs/wants, a trip name).
   *  Orthogonal to category: one category, any number of tags. */
  const [tags, setTags] = useState<string[]>([]);
  const [recurEnabled, setRecurEnabled] = useState(false);
  const [recurFreq, setRecurFreq] = useState<RecurFreq>('monthly');
  /**
   * Whether a due occurrence posts itself or waits to be logged.
   *
   * Defaults by kind: an expense you have already committed to can post itself,
   * but income and transfers default to waiting, because a salary that never
   * landed — silently posted on the 1st — corrupts every figure downstream and
   * does it quietly. Same reasoning as confirming an incoming transfer.
   */
  const [recurMode, setRecurMode] = useState<RecurMode>('auto');
  const [recurInterval, setRecurInterval] = useState('1');
  const [recurEndMs, setRecurEndMs] = useState<number | null>(null);
  const [recurEndMode, setRecurEndMode] = useState<RecurEndMode>(RecurEndMode.Never);
  const [recurCount, setRecurCount] = useState('12');
  /*
   * Parked, not broken. There is no currency picker anywhere: `setCurrency` is not
   * exported from this hook, `settings.setDefaultCurrency` has zero callers, and
   * `budget_group.default_currency` is never read or written — so `txn.currency` is
   * always written `undefined` and the app is INR-only. That matches the Currency
   * row in Settings, which is deliberately inert for the pilot.
   *
   * The read path stays so that shipping a picker is one screen, not a migration.
   */
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [snapshot, setSnapshot] = useState<AffordSnapshot | null>(null);

  const { place, setPlace, locEnabled, capturing: capturingLoc, capture: captureLocation } = useLocationCapture(isEditing);

  function onTitleChange(text: string) {
    setTitle(text);
    if (flags.smartCategory && !catManual && text.trim()) {
      const name = learnedMatch(text, learned, categories) ?? matchCategory(text, categories) ?? 'Other';
      const c = categories.find(cat => cat.name === name);
      if (c) setSelectedCategory(c);
    }
  }

  async function loadGroup(gid: string, meRow: Person | null, preselectCategory?: string, catKind: CategoryKind = 'expense') {
    const [cats, mems] = await Promise.all([
      getCategoriesByFrequency(db, gid, catKind),
      getGroupMembers(db, gid),
    ]);
    setCategories(cats);
    const pre = preselectCategory ? cats.find(c => c.name === preselectCategory) : null;
    setSelectedCategory(pre ?? cats[0] ?? null);
    setMembers(mems);
    const me_ = meRow ?? me;
    setSplitMembers(mems.map(m => m.id));
    if (me_) setPayerAmounts({ [me_.id]: '' });
    if (!isEditing && mems.length > 1) {
      const g = await getGroupById(db, gid);
      if (g) setSplitType(g.default_split);
    }
  }

  useEffect(() => {
    (async () => {
      // Prefer the store (usually hydrated); fall back to a direct read so a cold
      // first-open still selects a group + seeds the payer synchronously.
      const grps = groups.length ? groups : await getAllGroups(db);
      const meRow = me ?? await getMe(db);
      loadLearned().then(setLearned).catch(() => {});
      getAffordSnapshot(db).then(setSnapshot).catch(() => {});
      // Fire-and-forget: the destination row renders from the selected group, so
      // it doesn't wait on this — only the sheet's ordering does.
      getGroupsByRecentUse(db).then(setPickerGroups).catch(() => {});
      const savedCur = await settings.defaultCurrency();
      if (savedCur) setCurrency(savedCur as CurrencyCode);
      // The user's usual pay method seeds a NEW entry only. An edit hydrates the
      // row's own stored value below, and income overrides with the landing default.
      if (!editId && !recurEditId) {
        const savedPay = await settings.defaultPayMethod();
        if (savedPay) setPayMethod(asPayMethod(savedPay));
      }

      const loadId = editId ?? recurEditId;
      if (loadId) {
        const txn = await getTxnById(db, loadId);
        if (txn) {
          setSelectedGroupId(txn.group_id);
          await loadGroup(txn.group_id, meRow, txn.category, txn.kind === 'income' ? AddKind.Income : txn.kind === 'settlement' ? AddKind.Transfer : AddKind.Expense);
          setKind(txn.kind === 'income' ? AddKind.Income : txn.kind === 'settlement' ? AddKind.Transfer : AddKind.Expense);
          setTxnDate(txn.date);
          const total = txn.payments.reduce((a, p) => a + p.amount, 0);
          setAmountText(paiseToInput(total));
          setNote(txn.note ?? '');
          // Income's pay method means "where did it land?", so an income row with
          // no stored value must fall back to the landing default, not to UPI.
          setPayMethod(txn.pay_method ?? (txn.kind === 'income' ? INCOME_LANDING_DEFAULT : PayMethod.Upi));
          // Hydrated for EVERY load, not just a recurring one. This sat inside the
          // `recurEditId` branch below, so opening a normal transaction to edit it
          // left `tags` empty — and `handleSave` passes that straight to
          // `updateTxn`, where `serializeTags([])` writes NULL. Editing a tagged
          // transaction silently deleted its tags.
          setTags(parseTags(txn.tags));
          // Hydrated so the Receipt chip shows the receipt this row already has,
          // instead of always rendering unset while an existing file sat on disk.
          setAttachmentUri(txn.attachment_uri ?? null);
          originalAttachmentUriRef.current = txn.attachment_uri ?? null;

          if (txn.kind === 'settlement') {
            setTransferFromId(txn.payments[0]?.personId ?? '');
            setTransferToId(txn.shares[0]?.personId ?? '');
            setTransferScope(txn.group_id);
            setTransferNote(txn.note ?? '');
          }
          const personalGroup = grps.find(g => g.id === txn.group_id)?.is_personal === 1;
          if (txn.kind === 'expense' && !personalGroup) {
            setSplitType('exact');
            setSplitMembers(txn.shares.map(s => s.personId));
            setExactAmounts(Object.fromEntries(txn.shares.map(s => [s.personId, paiseToInput(s.amount)])));
            setPayerAmounts(Object.fromEntries(txn.payments.map(p => [p.personId, paiseToInput(p.amount)])));
          }
          if (recurEditId && txn.recur_freq) {
            setRecurEnabled(true);
            setRecurFreq(txn.recur_freq);
            setRecurInterval(String(txn.recur_interval ?? 1));
            if (txn.recur_end) { setRecurEndMs(txn.recur_end); setRecurEndMode(RecurEndMode.Date); }
          }
        }
        return;
      }

      let gid = paramGroupId ?? grps[0]?.id ?? '';
      if (kind === 'income') {
        gid = grps.find(g => g.is_personal === 1)?.id ?? gid;
        // `onSelectKind` applies this when the Income pill is tapped, but a deep
        // link (`/add/quick?kind=income`) never goes through it and landed on UPI
        // — the wrong answer to "where did it land?" before the user sees it.
        setPayMethod(INCOME_LANDING_DEFAULT);
      }
      setSelectedGroupId(gid);
      const preCat = typeof paramCategory === 'string' && paramCategory ? paramCategory : undefined;
      if (gid) await loadGroup(gid, meRow, preCat, kind === 'income' ? 'income' : kind === 'transfer' ? 'transfer' : 'expense');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Transfer: load everyone, default the payer to me, recompute scopes on change.
  useEffect(() => { getAllPersons(db).then(setAllPersons).catch(() => {}); }, [db]);
  useEffect(() => {
    if (!me) return;
    getFriendBalances(db, me.id)
      .then(fb => setPersonNet(Object.fromEntries(fb.map(f => [f.personId, f.net]))))
      .catch(() => {});
  }, [db, me]);
  useEffect(() => { if (!transferFromId && me) setTransferFromId(me.id); }, [me, transferFromId]);
  useEffect(() => {
    if (kind !== 'transfer' || !transferFromId || !transferToId || transferFromId === transferToId) { setTransferScopes(null); return; }
    let alive = true;
    computeTransferScopes(db, transferFromId, transferToId)
      .then(s => { if (alive) setTransferScopes(s); })
      .catch(() => { if (alive) setTransferScopes(null); });
    return () => { alive = false; };
  }, [db, kind, transferFromId, transferToId]);

  const total = parseToPaise(amountText);
  const transferScopeBal = transferScope === TRANSFER_SCOPE_ALL
    ? (transferScopes?.all.amount ?? 0)
    : (transferScopes?.groups.find(g => g.groupId === transferScope)?.amount ?? 0);

  /**
   * UPI hand-off for the Transfer flow. Lifted here (out of `TransferBody`) so
   * both it and `QuickAddSheets` — siblings under `quick.tsx`, neither the
   * other's parent — can read the same `payee`/`handoff` once `TransferBody`
   * no longer mounts `UpiUriSheet`/`RequestQrSheet` itself.
   */
  const transferFrom = allPersons.find(p => p.id === transferFromId) ?? null;
  const transferTo = allPersons.find(p => p.id === transferToId) ?? null;
  // Only when we know who is being paid, have their handle, and have an amount.
  // No VPA → no button, and settling behaves exactly as it did before.
  const transferPayee = flags.upiSettle && transferTo && transferTo.id !== me?.id && transferTo.upi_vpa && total > 0
    // Settling up with a friend is always person-to-person, so no `tr` — see UpiRequest.
    ? { vpa: transferTo.upi_vpa, name: transferTo.name, amountPaise: total, note: transferNote || 'BudgetSplit settle up', kind: 'person' as const }
    : null;
  // Every hand-off rule — the Android/iOS split, the remembered app, the picker —
  // lives in the hook, so this path and Scan & Pay cannot drift apart again.
  const transferHandoff = useUpiHandoff(
    'Install a UPI app like PhonePe, Google Pay, Paytm or BHIM to pay from here — or record this settlement manually.',
  );
  // A malformed VPA yields no URI at all, so there is nothing to offer.
  const canPayTransferUpi = !!transferPayee && !!buildUpiUri(transferPayee);
  // The other direction: money owed *to* you. Needs your handle set — Settings
  // › Getting paid. A QR reaches it better than an intent would: the payer's
  // own camera starts the payment inside their own app, so there is no
  // external intent for PhonePe/Paytm to refuse.
  const canRequestTransferQr = flags.upiSettle
    && !!me?.upi_vpa
    && transferTo?.id === me?.id
    && !!transferFrom && transferFrom.id !== me.id
    && total > 0
    && !!buildUpiRequestUri(me.upi_vpa, me.name, total);

  /**
   * Remember the settle-up we are about to hand off, so the app can ask about it
   * on return instead of relying on the user coming back and pressing Save.
   *
   * Runs *before* `Linking.openURL` — after the switch we are racing our own
   * suspension, and losing that race loses the record (see `useUpiHandoff`).
   *
   * The **resolved plan** is stored, not the inputs. `planAllGroupsSettlement`
   * reads live balances, so re-planning at confirm time could settle a different
   * group than the one the user was looking at when they paid — the same reason
   * `applyOverspendRaid` takes its withdrawals rather than recomputing them.
   */
  const transferHandoffHooks = {
    before: async () => {
      if (!transferFromId || !transferToId || transferFromId === transferToId || total <= 0) return;
      const plans = buildTransferPlans();
      if (plans.length === 0) return; // nothing to record; Save shows the real error
      await setPendingSettlement({
        plans,
        amountPaise: total,
        payeeName: transferTo?.name ?? 'them',
        category: selectedCategory?.name ?? 'Settlement',
        note: transferNote.trim() || undefined,
        payMethod,
        date: txnDate,
        startedAt: Date.now(),
      });
    },
    // The launch failed or the picker was dismissed, so no app ever opened and
    // there is nothing to ask about. Leaving the record would prompt "did that
    // payment go through?" for a payment that never started.
    onCancel: async () => { await setPendingSettlement(null); },
  };

  // Shared with voice capture (`lib/voiceDrain`) so a dictated transaction and a typed one
  // compose the same stored note.
  const composedNote = composeTitleNote(title, note, flags.smartCategory);

  const shares = kind === 'income'
    ? []
    : calcShares({ members, splitMembers, splitType, total, exactAmounts, percentages, ratios });
  const payments = calcPayments(payerAmounts, me?.id, total);
  const paymentsTotal = payments.reduce((s, x) => s + x.amount, 0);
  // Same allocation rule the Review commit path uses (lib/splitMath.validateShares).
  const shareCheck = validateShares(total, shares);
  const sharesTotal = shareCheck.assigned;
  const remainder = shareCheck.delta;
  const paymentRemainder = total - paymentsTotal;

  // Budget nudge: how much remains in the selected category this month.
  const nudgeStat = selectedCategory ? snapshot?.byCategory[selectedCategory.name] : null;
  const nudgeRemaining = nudgeStat?.budget != null ? nudgeStat.budget - nudgeStat.spentThisMonth : null;
  const nudgePct = nudgeRemaining != null && nudgeStat?.budget ? nudgeRemaining / nudgeStat.budget : null;

  // Same engine as /afford, so the answer reaches everyone at the moment of
  // spending rather than only those who find the Plan header icon. Only the
  // verdict is surfaced here; the screen is where the reasoning lives.
  const affordResult = useMemo(() => {
    if (kind !== 'expense' || !snapshot || total <= 0) return null;
    return evaluateAfford({
      amount: total,
      available: snapshot.available,
      upcomingBills: snapshot.upcomingBills,
      monthlyIncome: snapshot.incomeSource !== 'none' && snapshot.monthlyIncome > 0 ? snapshot.monthlyIncome : undefined,
      category: selectedCategory && nudgeStat
        ? {
            name: selectedCategory.name, spentThisMonth: nudgeStat.spentThisMonth,
            norm: nudgeStat.norm, budget: nudgeStat.budget, typicalBasket: nudgeStat.typicalBasket,
          }
        : undefined,
      projection: snapshot.projection ?? undefined,
      goalImpact: snapshot.goalPacing
        ? { name: snapshot.goalPacing.name, monthsDelayed: total / snapshot.goalPacing.monthlyRate }
        : undefined,
    });
  }, [kind, snapshot, total, selectedCategory, nudgeStat]);

  const canSave = kind === 'transfer'
    ? (total > 0 && transferFromId !== '' && transferToId !== '' && transferFromId !== transferToId && selectedCategory !== null)
    : (total > 0
        && selectedCategory !== null
        && selectedGroupId !== ''
        && (kind === 'income' || (remainder === 0 && paymentRemainder === 0))
        && (kind === 'income' ? paymentsTotal === total : true));

  function onSelectKind(k: AddKind) {
    haptic.selection();
    setKind(k);
    // Follow the kind's default. Switching kind changes what the answer should be,
    // and the user has not touched this control yet on a fresh form — the sheet
    // still lets them override it either way.
    setRecurMode(defaultRecurMode(k === 'transfer' ? 'settlement' : k));
    if (k === 'expense') {
      // Same group, so the category survives the catalog reload. (Income and
      // transfer genuinely switch to a different category catalog below, where
      // resetting the selection is the correct behaviour.)
      if (selectedGroupId) loadGroup(selectedGroupId, me, selectedCategory?.name, 'expense');
    } else if (k === 'transfer') {
      const gid = selectedGroupId || groups.find(g => g.is_personal === 1)?.id || groups[0]?.id || '';
      if (gid) loadGroup(gid, me, undefined, 'transfer');
    } else {
      const p = groups.find(g => g.is_personal === 1);
      const gid = p?.id ?? selectedGroupId;
      if (p && p.id !== selectedGroupId) setSelectedGroupId(p.id);
      if (gid) loadGroup(gid, me, undefined, 'income');
      // For income the pay-method field means "where did it land?", and the default
      // for spending (UPI) isn't a place money arrives into. Salary lands in a bank
      // account, so that's the sensible pre-fill. Only overridden when the user is
      // still on the spending default — never clobber a deliberate choice.
      if (!isEditing && payMethod === PayMethod.Upi) setPayMethod(INCOME_LANDING_DEFAULT);
    }
  }

  /**
   * Change only the time-of-day of `txnDate`, preserving the calendar date.
   *
   * `txn.date` has always been epoch ms and Review already renders `d MMM · h:mm a`, so
   * the time was being *stored* accurately and simply never editable — Add was the one
   * place that discarded the information. Seconds and ms are zeroed: the picker works in
   * 5-minute steps, so carrying a stray 37.412s through would be noise that only ever
   * showed up in sort order.
   */
  function setTxnTime(hour: number, minute: number) {
    const d = new Date(txnDate);
    d.setHours(hour, minute, 0, 0);
    setTxnDate(d.getTime());
  }

  /**
   * Apply a dictated draft to the form. **Fills, never saves** — the user still reviews the
   * whole form and taps Save, because misheard money is the worst kind of silent failure.
   *
   * Each field is applied only when the parser actually found something, so a partial
   * phrase ("groceries", no amount) can't wipe what's already typed. The category is
   * matched against the loaded catalog, so it always resolves to a real one.
   */
  function applyVoiceDraft(draft: {
    amountPaise: number; category: string | null; dateMs: number | null; note: string;
    personId?: string | null;
  }) {
    if (draft.amountPaise > 0) setAmountText(paiseToInput(draft.amountPaise));
    if (draft.category) {
      const hit = categories.find(c => c.name === draft.category);
      if (hit) { setSelectedCategory(hit); setCatManual(true); }
    }
    if (draft.dateMs != null) setTxnDate(draft.dateMs);

    if (kind === AddKind.Transfer) {
      // A transfer's note is a DIFFERENT field. This used to write `note`, which the transfer
      // form never renders and `handleSaveTransfer` never reads — so a dictated note was
      // invisible on screen and then silently dropped on save.
      if (draft.note) setTransferNote(draft.note);
      // "paid Riya five hundred" — the named person is who received it. Direction is NOT
      // inferred from the verb: `from` stays you, and reversing it is one tap on the arrow.
      // Guarded so a phrase naming yourself can't put the same person on both sides.
      if (draft.personId && draft.personId !== transferFromId) setTransferToId(draft.personId);
      return;
    }

    if (draft.note) {
      // With smart-category on the top field is the Title (which drives the category);
      // with it off the same field IS the note.
      if (flags.smartCategory) setTitle(draft.note); else setNote(draft.note);
    }
  }

  async function selectGroup(gid: string) {
    if (gid === selectedGroupId) return;
    setSelectedGroupId(gid);
    // Carry the chosen category across. Without this, `loadGroup` falls through to
    // `cats[0]` and silently replaces whatever the user picked with the new
    // group's most-used category — so choosing "Food" and *then* picking the group
    // quietly changed it, and the payer amounts were wiped too. Categories are
    // per-group rows keyed by name, so passing the name re-resolves it if the new
    // group has one to match, and falls back to `cats[0]` only when it doesn't.
    await loadGroup(gid, me, selectedCategory?.name);
  }

  /**
   * Which settlement rows this transfer becomes. One source, two readers: the Save
   * path writes them now, and the UPI hand-off stores them to write on confirm.
   * They were the same twelve lines in both places before the hand-off learned to
   * remember, and a settlement plan that differs by route is a balance that differs
   * by route.
   *
   * Empty means the two people share no group — the callers decide how loudly to
   * say so, because Save can show an alert and a hand-off cannot.
   */
  function buildTransferPlans(): Array<{ groupId: string; from: string; to: string; amount: number }> {
    if (!transferFromId || !transferToId) return [];
    const plans = transferScope === TRANSFER_SCOPE_ALL
      ? planAllGroupsSettlement(transferScopes ?? { groups: [], all: { amount: 0, from: transferFromId, to: transferToId } }, total, transferFromId, transferToId)
      : [{ groupId: transferScope, from: transferFromId, to: transferToId, amount: total }];
    if (plans.length > 0) return plans;
    // "All groups" with nothing owed anywhere: fall back to the first shared group
    // so an early repayment still lands somewhere real.
    const firstGroup = transferScopes?.groups[0];
    if (!firstGroup) return [];
    return [{ groupId: firstGroup.groupId, from: transferFromId, to: transferToId, amount: total }];
  }

  async function handleSaveTransfer() {
    if (!transferFromId || !transferToId || transferFromId === transferToId || total <= 0) return;
    // Saving by hand settles the same hand-off, so drop the remembered one first.
    // Without this, someone who pays via UPI and then taps Save gets asked about it
    // on the next foreground and can record the settlement a second time — the
    // duplicate guard only covers expenses.
    setPendingSettlement(null).catch(() => {});
    const transferCategory = selectedCategory?.name ?? 'Settlement';
    const transferFullNote = transferNote.trim() || undefined;
    setSaving(true);
    try {
      if (isEditing) {
        await updateTxn(db, {
          id: editId!, groupId: transferScope === TRANSFER_SCOPE_ALL ? selectedGroupId : transferScope,
          kind: 'settlement', date: txnDate, category: transferCategory,
          note: transferFullNote, payMethod, tags,
          payments: [{ personId: transferFromId, amount: total }],
          shares: [{ personId: transferToId, amount: total }],
        });
        haptic.success();
        router.back();
        return;
      }

      const finalPlans = buildTransferPlans();
      if (finalPlans.length === 0) {
        Alert.alert('No shared group', 'These two people don’t share a group to transfer in.');
        setSaving(false);
        return;
      }

      for (const [i, p] of finalPlans.entries()) {
        await recordSettlement(db, {
          groupId: p.groupId, fromId: p.from, toId: p.to, amount: p.amount,
          date: txnDate, note: transferFullNote, payMethod, category: transferCategory,
          tags,
          // The receipt goes on the FIRST plan only. Settling "all groups" writes one
          // settlement per group, and two rows pointing at the same file would let
          // `cleanupDeletedAttachments` unlink it when either is deleted — taking the
          // survivor's receipt with it. Tags are just strings, so they can repeat.
          attachmentUri: i === 0 ? attachmentUri ?? undefined : undefined,
        });
      }
      haptic.success();
      refresh();
      router.back();
    } catch (e) {
      haptic.error();
      // A full disk fails a transfer exactly like it fails an expense, and "try again"
      // is just as wrong here.
      const m = saveFailureMessage(e);
      Alert.alert(m.title, m.title === 'Error' ? 'Could not save the transfer.' : m.body);
    } finally {
      setSaving(false);
    }
  }

  /**
   * Say what the money you just logged left behind.
   *
   * Manual entry happens *after* the spend, so this screen is a consequence
   * surface, not a decision one — and consequence is exactly what's missing.
   * CHI 2024 (`From Cash to Cashless`, 276 surveyed / 34 usability-tested) found
   * ~75% of Indian UPI users spend more since switching, and attributes it to
   * the payment being intangible: nothing pushes back. Seeing what a purchase
   * cost you, in the seconds after logging it, is the cheapest thing that does.
   *
   * Deliberately fire-and-forget: this runs after the write has already
   * succeeded and the screen is dismissing, so a failure here must never surface
   * as a save error. No toast is strictly better than a wrong one.
   */
  function showSpendConsequence() {
    if (kind !== 'expense') return;
    getSafeToSpend(db)
      .then(sts => {
        if (sts.amount < 0) {
          showToast({ message: `That puts you ${formatRupees(-sts.amount)} over what's yours to spend.`, icon: 'alert-triangle', tone: 'bad' });
        } else {
          showToast({ message: `${formatRupees(sts.amount)} left to spend over ${sts.daysLeft} days.`, icon: 'trending-down' });
        }
      })
      .catch(() => {});
  }

  /**
   * Save, then leave — unless the caller wants to decide where to go.
   *
   * `onSaved` exists for voice auto-save: a confident phrase posts itself and lands on the new
   * transaction rather than dismissing, so a mis-hearing is in front of you instead of buried
   * in a list. Passing it replaces the `router.back()` this otherwise ends with; the duplicate
   * prompt still fires either way, which is exactly the guard auto-save wants.
   */
  async function handleSave(opts?: { onSaved?: (txnId: string) => void }) {
    if (kind === 'transfer') return handleSaveTransfer();
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const finalPayments = kind === 'income' ? [{ personId: me!.id, amount: total }] : payments;
      const finalShares = kind === 'income' ? [] : shares;

      // Defence in depth: canSave already blocks an unbalanced split, but this is
      // the write boundary — an `exact` split is read verbatim, so a shortfall
      // must never reach insertTxn/updateTxn. Refuse; never silently reconcile.
      if (kind !== 'income') {
        const check = validateShares(total, finalShares);
        if (!check.ok) {
          setSaving(false);
          haptic.error();
          Alert.alert(
            'Split doesn’t add up',
            check.delta > 0
              ? `${formatRupees(check.delta)} is still unassigned. Adjust the split so it totals ${formatRupees(total)}.`
              : `The split is over by ${formatRupees(-check.delta)}. It must total ${formatRupees(total)}.`,
          );
          return;
        }
      }

      const recurNorm = normalizeRecurrence(recurFreq, parseInt(recurInterval, 10) || 1);

      if (isEditing) {
        await updateTxn(db, {
          id: editId!, groupId: selectedGroupId, kind, date: txnDate,
          category: selectedCategory!.name, note: composedNote, payMethod, tags,
          attachmentUri, payments: finalPayments, shares: finalShares,
        });
        // Replacing or removing the receipt must unlink the old file, or it
        // orphans on disk forever — nothing else ever revisits a transaction's
        // *previous* attachment.
        const original = originalAttachmentUriRef.current;
        if (original && original !== attachmentUri) await deleteAttachment(original);
        haptic.success();
        router.back();
        return;
      }

      if (isRecurEdit) {
        // `splitRecurringSeries` returns null when there is no future occurrence
        // left to edit — a finished or fully-skipped series. Discarding that and
        // firing `haptic.success(); router.back()` told the user their edit was
        // saved when nothing at all had been written.
        const splitId = await splitRecurringSeries(db, recurEditId!, {
          groupId: selectedGroupId, kind, entryMode: 'quick',
          date: txnDate, category: selectedCategory!.name, note: composedNote, payMethod,
          // Tags and the receipt are part of the rule the user is editing; omitting
          // them here silently stripped both from the series on every "this & future".
          tags,
          attachmentUri: attachmentUri ?? undefined,
          recurFreq: recurNorm.freq,
          recurMode,
          recurInterval: recurNorm.interval,
          currency: currency !== DEFAULT_CURRENCY ? currency : undefined,
          payments: finalPayments, shares: finalShares,
        });
        if (splitId === null) {
          setSaving(false);
          haptic.error();
          Alert.alert(
            'Nothing left to change',
            'This series has no upcoming occurrence, so there is nothing to apply the edit to. Edit a past transaction directly, or start a new recurring rule.',
          );
          return;
        }
        haptic.success();
        router.back();
        return;
      }

      // Normalised before the end-date maths, so a "custom every 1 day" rule and a
      // `daily` one land on the same occurrence dates as well as the same row shape.
      const recurIntervalN = recurNorm.interval ?? 1;
      let recurEnd: number | undefined;
      if (recurEnabled) {
        if (recurEndMode === RecurEndMode.Date) {
          // An end date on or before the start used to fall through to `undefined`,
          // which does not mean "invalid" — it means **never ends**. The user picked
          // a bound and got an unbounded rule, with nothing on screen to say so.
          if (recurEndMs && recurEndMs <= txnDate) {
            setSaving(false);
            haptic.error();
            Alert.alert(
              'End date is before the start',
              'The repeat has to end after the first occurrence. Pick a later end date, or choose “Never” to repeat indefinitely.',
            );
            return;
          }
          recurEnd = recurEndMs ?? undefined;
        } else if (recurEndMode === RecurEndMode.Count) {
          const n = Math.max(1, parseInt(recurCount, 10) || 1);
          recurEnd = nthOccurrenceMs(txnDate, recurNorm.freq, recurIntervalN, n);
        }
      }

      const commit = async () => {
        const newId = await insertTxn(db, {
          groupId: selectedGroupId, kind, entryMode: 'quick', date: txnDate,
          category: selectedCategory!.name, note: composedNote, payMethod, tags,
          attachmentUri: attachmentUri ?? undefined,
          recurFreq: recurEnabled ? recurNorm.freq : undefined,
          recurInterval: recurEnabled ? recurNorm.interval : undefined,
          recurMode: recurEnabled ? recurMode : undefined,
          recurEnd,
          lat: place?.lat, lng: place?.lng, placeLabel: place?.label ?? undefined,
          currency: currency !== DEFAULT_CURRENCY ? currency : undefined,
          payments: finalPayments, shares: finalShares,
        });
        haptic.success();
        refresh();
        showSpendConsequence();
        if (opts?.onSaved) opts.onSaved(newId);
        else router.back();
      };

      if (kind === 'expense' && !recurEnabled) {
        const dup = await findRecentDuplicate(db, selectedGroupId, selectedCategory!.name, total, txnDate);
        if (dup) {
          setSaving(false);
          Alert.alert(
            'Possible duplicate',
            `You already logged ${formatRupees(total)} on ${selectedCategory!.name} recently. Add it anyway?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Add anyway', onPress: () => { setSaving(true); commit().catch(e => { const m = saveFailureMessage(e); Alert.alert(m.title, m.body); }).finally(() => setSaving(false)); } },
            ],
          );
          return;
        }
      }

      await commit();
    } catch (e) {
      const m = saveFailureMessage(e);
      Alert.alert(m.title, m.body);
    } finally {
      setSaving(false);
    }
  }

  // Learn a merchant→category preference when the user picks a category manually.
  function recordCategoryChoice(categoryName: string) {
    if (kind !== 'transfer' && title.trim()) recordCorrection(title, categoryName).then(setLearned).catch(() => {});
  }

  return {
    // meta
    isEditing, isRecurEdit, flags, saving,
    // core
    kind, onSelectKind, amountText, setAmountText, total,
    groups, selectedGroupId, setSelectedGroupId, selectGroup, loadGroup, me,
    /** Recency-ordered, for the destination picker. Falls back to store order. */
    pickerGroups: pickerGroups.length ? pickerGroups : groups,
    selectedGroup: groups.find(g => g.id === selectedGroupId) ?? null,
    categories, setCategories, selectedCategory, setSelectedCategory, setCatManual, onTitleChange, recordCategoryChoice,
    /** Merchant→category corrections the user has made. Exposed so voice entry inherits
     *  them too — `parseVoice` has always accepted them, but nothing passed them in, so
     *  that branch was dead in the app while two docblocks claimed otherwise. */
    learned,
    title, note, setNote, setTitle,
    txnDate, setTxnDate,
    members,
    // split / payers
    splitType, setSplitType, splitMembers, setSplitMembers,
    exactAmounts, setExactAmounts, percentages, setPercentages, ratios, setRatios, payerAmounts, setPayerAmounts,
    shares, payments, remainder, paymentRemainder, paymentsTotal,
    // transfer
    allPersons, personNet, transferFromId, setTransferFromId, transferToId, setTransferToId,
    transferScope, setTransferScope, transferScopes, transferNote, setTransferNote, transferScopeBal,
    transferFrom, transferTo, transferPayee, transferHandoff, canPayTransferUpi, canRequestTransferQr,
    transferHandoffHooks,
    payMethod, setPayMethod,
    // recurring
    recurEnabled, setRecurEnabled,
    recurMode, setRecurMode, recurFreq, setRecurFreq, recurInterval, setRecurInterval,
    recurEndMs, setRecurEndMs, recurEndMode, setRecurEndMode, recurCount, setRecurCount,
    // attachment / location
    attachmentUri, setAttachmentUri, tags, setTags, setTxnTime, applyVoiceDraft, place, setPlace, locEnabled, capturingLoc, captureLocation,
    // currency / nudge / derived
    currency, snapshot, nudgeStat, nudgeRemaining, nudgePct, affordResult, composedNote, canSave,
    // actions
    handleSave,
  };
}
