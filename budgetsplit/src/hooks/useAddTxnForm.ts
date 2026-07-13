import { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { nthOccurrenceMs } from '../lib/recurrence';
import { settings } from '../lib/settings';
import { matchCategory } from '../lib/smartCategory';
import { loadLearned, learnedMatch, recordCorrection, type LearnedMap } from '../lib/smartCategoryLearn';
import { DEFAULT_CURRENCY, type CurrencyCode } from '../constants/currencies';
import { getAllGroups, getGroupById } from '../db/queries/groups';
import { getGroupMembers, getMe, getAllPersons } from '../db/queries/persons';
import { getFriendBalances } from '../db/queries/balances';
import { computeTransferScopes, planAllGroupsSettlement, type TransferScopes } from '../lib/settleScope';
import { getCategoriesByFrequency, type CategoryKind } from '../db/queries/categories';
import { insertTxn, updateTxn, getTxnById, splitRecurringSeries, findRecentDuplicate, recordSettlement } from '../db/queries/transactions';
import { parseToPaise, formatRupees } from '../lib/money';
import { computeShares as calcShares, computePayments as calcPayments } from '../lib/splitMath';
import { getAffordSnapshot, type AffordSnapshot } from '../db/queries/savings';
import { haptic } from '../lib/haptics';
import { useFeatureFlags } from '../components/system/FeatureFlagsProvider';
import { useDataRefresh } from '../components/system/DataRefreshProvider';
import { useLocationCapture } from './useLocationCapture';
import type { BudgetGroup } from '../db/queries/groups';
import type { Person } from '../db/queries/persons';
import type { Category } from '../db/queries/categories';
import type { SplitMode, RecurFreq, PayMethod } from '../constants/enums';
import type { AddKind } from '../components/finance/add/KindToggle';

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

  const [groups, setGroups] = useState<BudgetGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState(paramGroupId ?? '');
  const [kind, setKind] = useState<AddKind>(
    paramKind === 'income' ? 'income' : paramKind === 'transfer' ? 'transfer' : 'expense',
  );
  const [amountText, setAmountText] = useState(paramAmount && /^\d+$/.test(paramAmount) ? (parseInt(paramAmount, 10) / 100).toString() : '');
  const [allPersons, setAllPersons] = useState<Person[]>([]);
  const [personNet, setPersonNet] = useState<Record<string, number>>({});
  const [transferFromId, setTransferFromId] = useState(paramFrom ?? '');
  const [transferToId, setTransferToId] = useState(paramTo ?? '');
  const [transferScope, setTransferScope] = useState<'all' | string>(paramGroupId ?? 'all');
  const [transferScopes, setTransferScopes] = useState<TransferScopes | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>('upi');
  const [transferNote, setTransferNote] = useState('');
  const [note, setNote] = useState(typeof paramNote === 'string' ? paramNote : '');
  const [title, setTitle] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [catManual, setCatManual] = useState(false);
  const [learned, setLearned] = useState<LearnedMap>({});
  const [members, setMembers] = useState<Person[]>([]);
  const [me, setMe] = useState<Person | null>(null);
  const [txnDate, setTxnDate] = useState(paramDate && /^\d+$/.test(paramDate) ? parseInt(paramDate, 10) : Date.now());
  const [splitType, setSplitType] = useState<SplitMode>('equal');
  const [splitMembers, setSplitMembers] = useState<string[]>([]);
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [percentages, setPercentages] = useState<Record<string, string>>({});
  const [ratios, setRatios] = useState<Record<string, string>>({});
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [attachmentUri, setAttachmentUri] = useState<string | null>(null);
  const [recurEnabled, setRecurEnabled] = useState(false);
  const [recurFreq, setRecurFreq] = useState<RecurFreq>('monthly');
  const [recurInterval, setRecurInterval] = useState('1');
  const [recurEndMs, setRecurEndMs] = useState<number | null>(null);
  const [recurEndMode, setRecurEndMode] = useState<'never' | 'date' | 'count'>('never');
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
      const grps = await getAllGroups(db);
      setGroups(grps);
      const meRow = await getMe(db);
      setMe(meRow);
      loadLearned().then(setLearned).catch(() => {});
      getAffordSnapshot(db).then(setSnapshot).catch(() => {});
      const savedCur = await settings.defaultCurrency();
      if (savedCur) setCurrency(savedCur as CurrencyCode);

      const loadId = editId ?? recurEditId;
      if (loadId) {
        const txn = await getTxnById(db, loadId);
        if (txn) {
          setSelectedGroupId(txn.group_id);
          await loadGroup(txn.group_id, meRow, txn.category, txn.kind === 'income' ? 'income' : txn.kind === 'settlement' ? 'transfer' : 'expense');
          setKind(txn.kind === 'income' ? 'income' : txn.kind === 'settlement' ? 'transfer' : 'expense');
          setTxnDate(txn.date);
          const total = txn.payments.reduce((a, p) => a + p.amount, 0);
          setAmountText((total / 100).toString());
          setNote(txn.note ?? '');
          setPayMethod(txn.pay_method ?? 'upi');

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
            if (txn.recur_end) { setRecurEndMs(txn.recur_end); setRecurEndMode('date'); }
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
  const transferScopeBal = transferScope === 'all'
    ? (transferScopes?.all.amount ?? 0)
    : (transferScopes?.groups.find(g => g.groupId === transferScope)?.amount ?? 0);

  const composedNote = (flags.smartCategory
    ? [title.trim(), note.trim()].filter(Boolean).join(' — ')
    : note.trim()) || undefined;

  const shares = kind === 'income'
    ? []
    : calcShares({ members, splitMembers, splitType, total, exactAmounts, percentages, ratios });
  const payments = calcPayments(payerAmounts, me?.id, total);
  const sharesTotal = shares.reduce((s, x) => s + x.amount, 0);
  const paymentsTotal = payments.reduce((s, x) => s + x.amount, 0);
  const remainder = total - sharesTotal;
  const paymentRemainder = total - paymentsTotal;

  // Budget nudge: how much remains in the selected category this month.
  const nudgeStat = selectedCategory ? snapshot?.byCategory[selectedCategory.name] : null;
  const nudgeRemaining = nudgeStat?.budget != null ? nudgeStat.budget - nudgeStat.spentThisMonth : null;
  const nudgePct = nudgeRemaining != null && nudgeStat?.budget ? nudgeRemaining / nudgeStat.budget : null;

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
      if (selectedGroupId) loadGroup(selectedGroupId, me, undefined, 'expense');
    } else if (k === 'transfer') {
      const gid = selectedGroupId || groups.find(g => g.is_personal === 1)?.id || groups[0]?.id || '';
      if (gid) loadGroup(gid, me, undefined, 'transfer');
    } else {
      const p = groups.find(g => g.is_personal === 1);
      const gid = p?.id ?? selectedGroupId;
      if (p && p.id !== selectedGroupId) setSelectedGroupId(p.id);
      if (gid) loadGroup(gid, me, undefined, 'income');
    }
  }

  async function selectGroup(gid: string) {
    setSelectedGroupId(gid);
    await loadGroup(gid, me);
  }

  async function handleSaveTransfer() {
    if (!transferFromId || !transferToId || transferFromId === transferToId || total <= 0) return;
    const transferCategory = selectedCategory?.name ?? 'Settlement';
    const transferFullNote = transferNote.trim() || undefined;
    setSaving(true);
    try {
      if (isEditing) {
        await updateTxn(db, {
          id: editId!, groupId: transferScope === 'all' ? selectedGroupId : transferScope,
          kind: 'settlement', date: txnDate, category: transferCategory,
          note: transferFullNote, payMethod,
          payments: [{ personId: transferFromId, amount: total }],
          shares: [{ personId: transferToId, amount: total }],
        });
        haptic.success();
        router.back();
        return;
      }

      const plans = transferScope === 'all'
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
    } catch {
      haptic.error();
      Alert.alert('Error', 'Could not save the transfer.');
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

      if (isEditing) {
        await updateTxn(db, {
          id: editId!, groupId: selectedGroupId, kind, date: txnDate,
          category: selectedCategory!.name, note: composedNote, payMethod,
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
        if (recurEndMode === 'date') {
          recurEnd = recurEndMs && recurEndMs > txnDate ? recurEndMs : undefined;
        } else if (recurEndMode === 'count') {
          const n = Math.max(1, parseInt(recurCount, 10) || 1);
          recurEnd = nthOccurrenceMs(txnDate, recurFreq, recurIntervalN, n);
        }
      }

      const commit = async () => {
        await insertTxn(db, {
          groupId: selectedGroupId, kind, entryMode: 'quick', date: txnDate,
          category: selectedCategory!.name, note: composedNote, payMethod,
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
              { text: 'Add anyway', onPress: () => { setSaving(true); commit().catch(() => Alert.alert('Error', 'Could not save. Try again.')).finally(() => setSaving(false)); } },
            ],
          );
          return;
        }
      }

      await commit();
    } catch (e) {
      Alert.alert('Error', 'Could not save. Try again.');
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
    categories, setCategories, selectedCategory, setSelectedCategory, setCatManual, onTitleChange, recordCategoryChoice,
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
    attachmentUri, setAttachmentUri, place, setPlace, locEnabled, capturingLoc, captureLocation,
    // currency / nudge / derived
    currency, snapshot, nudgeStat, nudgeRemaining, nudgePct, composedNote, canSave,
    // actions
    handleSave,
  };
}
