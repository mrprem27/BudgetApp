import { useState, useEffect, useMemo } from 'react';
import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { nthOccurrenceMs } from '../lib/recurrence';
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
import { parseToPaise, formatRupees } from '../lib/money';
import { computeShares as calcShares, computePayments as calcPayments, validateShares } from '../lib/splitMath';
import { getAffordSnapshot, type AffordSnapshot } from '../db/queries/savings';
import { evaluateAfford } from '../lib/afford';
import { haptic } from '../lib/haptics';
import { saveFailureMessage } from '../lib/dbErrors';
import { useFeatureFlags } from '../components/system/FeatureFlagsProvider';
import { useDataRefresh } from '../components/system/DataRefreshProvider';
import { useStore } from '../store';
import { useLocationCapture } from './useLocationCapture';
import type { BudgetGroup } from '../db/queries/groups';
import type { Person } from '../db/queries/persons';
import type { Category } from '../db/queries/categories';
import { AddKind, PayMethod, RecurEndMode, INCOME_LANDING_DEFAULT, TRANSFER_SCOPE_ALL, type TransferScope } from '../constants/enums';
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

  // groups + me come from the hydrated zustand store (single source of truth).
  // The mount effect below has a cold-start query fallback for the first-ever open
  // before hydration completes, so initial group selection + payer seeding are safe.
  const groups = useStore(s => s.groups);
  const me = useStore(s => s.me);
  const [selectedGroupId, setSelectedGroupId] = useState(paramGroupId ?? '');
  const [kind, setKind] = useState<AddKind>(
    paramKind === AddKind.Income ? AddKind.Income : paramKind === AddKind.Transfer ? AddKind.Transfer : AddKind.Expense,
  );
  const [amountText, setAmountText] = useState(paramAmount && /^\d+$/.test(paramAmount) ? (parseInt(paramAmount, 10) / 100).toString() : '');
  const [allPersons, setAllPersons] = useState<Person[]>([]);
  const [personNet, setPersonNet] = useState<Record<string, number>>({});
  const [transferFromId, setTransferFromId] = useState(paramFrom ?? '');
  const [transferToId, setTransferToId] = useState(paramTo ?? '');
  const [transferScope, setTransferScope] = useState<TransferScope>(paramGroupId ?? TRANSFER_SCOPE_ALL);
  const [transferScopes, setTransferScopes] = useState<TransferScopes | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>(PayMethod.Upi);
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
  /** Free-form tags — the axis categories can't express (needs/wants, a trip name).
   *  Orthogonal to category: one category, any number of tags. */
  const [tags, setTags] = useState<string[]>([]);
  const [recurEnabled, setRecurEnabled] = useState(false);
  const [recurFreq, setRecurFreq] = useState<RecurFreq>('monthly');
  const [recurInterval, setRecurInterval] = useState('1');
  const [recurEndMs, setRecurEndMs] = useState<number | null>(null);
  const [recurEndMode, setRecurEndMode] = useState<RecurEndMode>(RecurEndMode.Never);
  const [recurCount, setRecurCount] = useState('12');
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

      const loadId = editId ?? recurEditId;
      if (loadId) {
        const txn = await getTxnById(db, loadId);
        if (txn) {
          setSelectedGroupId(txn.group_id);
          await loadGroup(txn.group_id, meRow, txn.category, txn.kind === 'income' ? AddKind.Income : txn.kind === 'settlement' ? AddKind.Transfer : AddKind.Expense);
          setKind(txn.kind === 'income' ? AddKind.Income : txn.kind === 'settlement' ? AddKind.Transfer : AddKind.Expense);
          setTxnDate(txn.date);
          const total = txn.payments.reduce((a, p) => a + p.amount, 0);
          setAmountText((total / 100).toString());
          setNote(txn.note ?? '');
          setPayMethod(txn.pay_method ?? PayMethod.Upi);

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
            setExactAmounts(Object.fromEntries(txn.shares.map(s => [s.personId, (s.amount / 100).toString()])));
            setPayerAmounts(Object.fromEntries(txn.payments.map(p => [p.personId, (p.amount / 100).toString()])));
          }
          if (recurEditId && txn.recur_freq) {
            setRecurEnabled(true);
            setRecurFreq(txn.recur_freq);
            setRecurInterval(String(txn.recur_interval ?? 1));
            if (txn.recur_end) { setRecurEndMs(txn.recur_end); setRecurEndMode(RecurEndMode.Date); }
            setTags(parseTags(txn.tags));
          }
        }
        return;
      }

      let gid = paramGroupId ?? grps[0]?.id ?? '';
      if (kind === 'income') gid = grps.find(g => g.is_personal === 1)?.id ?? gid;
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

  const composedNote = (flags.smartCategory
    ? [title.trim(), note.trim()].filter(Boolean).join(' — ')
    : note.trim()) || undefined;

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
  function applyVoiceDraft(draft: { amountPaise: number; category: string | null; dateMs: number | null; note: string }) {
    if (draft.amountPaise > 0) setAmountText((draft.amountPaise / 100).toString());
    if (draft.category) {
      const hit = categories.find(c => c.name === draft.category);
      if (hit) { setSelectedCategory(hit); setCatManual(true); }
    }
    if (draft.dateMs != null) setTxnDate(draft.dateMs);
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

  async function handleSaveTransfer() {
    if (!transferFromId || !transferToId || transferFromId === transferToId || total <= 0) return;
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

      const plans = transferScope === TRANSFER_SCOPE_ALL
        ? planAllGroupsSettlement(transferScopes ?? { groups: [], all: { amount: 0, from: transferFromId, to: transferToId } }, total, transferFromId, transferToId)
        : [{ groupId: transferScope, from: transferFromId, to: transferToId, amount: total }];

      let finalPlans = plans;
      if (finalPlans.length === 0) {
        const firstGroup = transferScopes?.groups[0];
        if (!firstGroup) { Alert.alert('No shared group', 'These two people don’t share a group to transfer in.'); setSaving(false); return; }
        finalPlans = [{ groupId: firstGroup.groupId, from: transferFromId, to: transferToId, amount: total }];
      }

      for (const p of finalPlans) {
        await recordSettlement(db, {
          groupId: p.groupId, fromId: p.from, toId: p.to, amount: p.amount,
          date: txnDate, note: transferFullNote, payMethod, category: transferCategory,
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

  async function handleSave() {
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

      if (isEditing) {
        await updateTxn(db, {
          id: editId!, groupId: selectedGroupId, kind, date: txnDate,
          category: selectedCategory!.name, note: composedNote, payMethod, tags,
          payments: finalPayments, shares: finalShares,
        });
        haptic.success();
        router.back();
        return;
      }

      if (isRecurEdit) {
        await splitRecurringSeries(db, recurEditId!, {
          groupId: selectedGroupId, kind, entryMode: 'quick',
          date: txnDate, category: selectedCategory!.name, note: composedNote, payMethod,
          recurFreq: recurFreq,
          recurInterval: recurFreq === 'custom' ? parseInt(recurInterval, 10) || 1 : undefined,
          currency: currency !== DEFAULT_CURRENCY ? currency : undefined,
          payments: finalPayments, shares: finalShares,
        });
        haptic.success();
        router.back();
        return;
      }

      const recurIntervalN = recurFreq === 'custom' ? (parseInt(recurInterval, 10) || 1) : 1;
      let recurEnd: number | undefined;
      if (recurEnabled) {
        if (recurEndMode === RecurEndMode.Date) {
          recurEnd = recurEndMs && recurEndMs > txnDate ? recurEndMs : undefined;
        } else if (recurEndMode === RecurEndMode.Count) {
          const n = Math.max(1, parseInt(recurCount, 10) || 1);
          recurEnd = nthOccurrenceMs(txnDate, recurFreq, recurIntervalN, n);
        }
      }

      const commit = async () => {
        await insertTxn(db, {
          groupId: selectedGroupId, kind, entryMode: 'quick', date: txnDate,
          category: selectedCategory!.name, note: composedNote, payMethod, tags,
          attachmentUri: attachmentUri ?? undefined,
          recurFreq: recurEnabled ? recurFreq : undefined,
          recurInterval: recurEnabled && recurFreq === 'custom' ? parseInt(recurInterval, 10) || 1 : undefined,
          recurEnd,
          lat: place?.lat, lng: place?.lng, placeLabel: place?.label ?? undefined,
          currency: currency !== DEFAULT_CURRENCY ? currency : undefined,
          payments: finalPayments, shares: finalShares,
        });
        haptic.success();
        refresh();
        router.back();
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
    payMethod, setPayMethod,
    // recurring
    recurEnabled, setRecurEnabled, recurFreq, setRecurFreq, recurInterval, setRecurInterval,
    recurEndMs, setRecurEndMs, recurEndMode, setRecurEndMode, recurCount, setRecurCount,
    // attachment / location
    attachmentUri, setAttachmentUri, tags, setTags, setTxnTime, applyVoiceDraft, place, setPlace, locEnabled, capturingLoc, captureLocation,
    // currency / nudge / derived
    currency, snapshot, nudgeStat, nudgeRemaining, nudgePct, affordResult, composedNote, canSave,
    // actions
    handleSave,
  };
}
