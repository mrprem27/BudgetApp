import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, Alert, Modal, Pressable, Switch, Image,
  Platform, ActionSheetIOS, Keyboard, KeyboardAvoidingView,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { format, isSameDay } from 'date-fns';
import { nthOccurrenceMs } from '../../src/lib/recurrence';
import { settings } from '../../src/lib/settings';
import { getCurrentPlace, type CapturedPlace } from '../../src/lib/location';
import { colors } from '../../src/constants/colors';
import { asFeather } from '../../src/constants/palette';
import { matchCategory } from '../../src/lib/smartCategory';
import { loadLearned, learnedMatch, recordCorrection, type LearnedMap } from '../../src/lib/smartCategoryLearn';
import { categoryVisual } from '../../src/constants/categories';
import { type } from '../../src/constants/typography';
import { space, radius, layout } from '../../src/constants/layout';
import { DEFAULT_CURRENCY, type CurrencyCode, CURRENCY_MAP } from '../../src/constants/currencies';
import { getAllGroups, getGroupById } from '../../src/db/queries/groups';
import { getGroupMembers, getMe, getAllPersons } from '../../src/db/queries/persons';
import { getFriendBalances } from '../../src/db/queries/balances';
import { TransferBody } from '../../src/components/finance/TransferBody';
import { computeTransferScopes, planAllGroupsSettlement, type TransferScopes } from '../../src/lib/settleScope';
import { getCategoriesByFrequency, insertCategory, type CategoryKind } from '../../src/db/queries/categories';
import { insertTxn, updateTxn, getTxnById, splitRecurringSeries, findRecentDuplicate, recordSettlement } from '../../src/db/queries/transactions';
import { parseToPaise, formatRupees, formatCompact, splitEqual, splitByPercent, splitByShares, formatAmountInput, sanitizeAmountInput } from '../../src/lib/money';
import { getAffordSnapshot, type AffordSnapshot } from '../../src/db/queries/savings';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { CategoryPicker } from '../../src/components/finance/CategoryPicker';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { DatePickerSheet } from '../../src/components/ui/DatePickerSheet';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { SplitSheet } from '../../src/components/finance/add/SplitSheet';
import { RecurringControls } from '../../src/components/finance/add/RecurringControls';
import { PayersSheet } from '../../src/components/finance/add/PayersSheet';
import { TransferSlotSheet } from '../../src/components/finance/add/TransferSlotSheet';
import { AvatarStack } from '../../src/components/finance/AvatarStack';
import { GroupSelector } from '../../src/components/finance/GroupSelector';
import { ModalHeader } from '../../src/components/ui/ModalHeader';
import { MoreOptions } from '../../src/components/ui/MoreOptions';
import { AmountText } from '../../src/components/ui/AmountText';
import { Input } from '../../src/components/ui/Input';
import { haptic } from '../../src/lib/haptics';
import { pickAttachment, AttachmentStorageError } from '../../src/lib/attachment';
import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';
import type { BudgetGroup } from '../../src/db/queries/groups';
import type { Person } from '../../src/db/queries/persons';
import type { Category } from '../../src/db/queries/categories';
import { type SplitMode, type RecurFreq, type PayMethod } from '../../src/constants/enums';
import { oweView } from '../../src/lib/owe';

export default function QuickAddScreen() {
  const insets = useSafeAreaInsets();
  const { groupId: paramGroupId, kind: paramKind, editId, recurEditId, from: paramFrom, to: paramTo, amount: paramAmount, note: paramNote, date: paramDate } =
    useLocalSearchParams<{ groupId?: string; kind?: string; editId?: string; recurEditId?: string; from?: string; to?: string; amount?: string; note?: string; date?: string }>();
  const isEditing = !!editId;
  const isRecurEdit = !!recurEditId; // "this & future" edit of a recurring series
  const db = useSQLiteContext();
  const router = useRouter();
  const { flags } = useFeatureFlags();

  const [groups, setGroups] = useState<BudgetGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState(paramGroupId ?? '');
  const [kind, setKind] = useState<'income' | 'expense' | 'transfer'>(
    paramKind === 'income' ? 'income' : paramKind === 'transfer' ? 'transfer' : 'expense',
  );
  // Optional deep-link prefill (e.g. "Settle with Rahul" → kind=transfer&to=…).
  // Purely additive: with no params these all fall back to the normal defaults.
  const [amountText, setAmountText] = useState(paramAmount && /^\d+$/.test(paramAmount) ? (parseInt(paramAmount, 10) / 100).toString() : '');
  // Transfer (settlement) state — only used when kind === 'transfer'.
  const [allPersons, setAllPersons] = useState<Person[]>([]);
  // Net balance with each person (>0 = they owe me, <0 = I owe them) — shown in the transfer picker.
  const [personNet, setPersonNet] = useState<Record<string, number>>({});
  const [transferFromId, setTransferFromId] = useState(paramFrom ?? '');
  const [transferToId, setTransferToId] = useState(paramTo ?? '');
  const [transferSlot, setTransferSlot] = useState<'from' | 'to' | null>(null); // which slot the picker fills
  // Launched from a group's FAB → pre-select that group's transfer scope.
  const [transferScope, setTransferScope] = useState<'all' | string>(paramGroupId ?? 'all');
  const [transferScopes, setTransferScopes] = useState<TransferScopes | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>('upi');
  const [transferNote, setTransferNote] = useState('');
  const [note, setNote] = useState(typeof paramNote === 'string' ? paramNote : '');
  const [title, setTitle] = useState(''); // smart-category title (drives category); separate from Note
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [catManual, setCatManual] = useState(false); // user overrode the smart guess
  const [learned, setLearned] = useState<LearnedMap>({});

  // Smart categories: typing a title auto-picks a category (until the user overrides).
  // Learned corrections take priority over the built-in keyword rules; anything
  // we can't confidently place falls back to "Other" (the catch-all) rather than
  // silently leaving whatever was preselected.
  function onTitleChange(text: string) {
    setTitle(text);
    if (flags.smartCategory && !catManual && text.trim()) {
      const name = learnedMatch(text, learned, categories) ?? matchCategory(text, categories) ?? 'Other';
      const c = categories.find(cat => cat.name === name);
      if (c) setSelectedCategory(c);
    }
  }
  const [members, setMembers] = useState<Person[]>([]);
  const [me, setMe] = useState<Person | null>(null);
  const [showSplit, setShowSplit] = useState(false);
  const [showPayers, setShowPayers] = useState(false);
  const [txnDate, setTxnDate] = useState(paramDate && /^\d+$/.test(paramDate) ? parseInt(paramDate, 10) : Date.now());
  const [showDate, setShowDate] = useState(false);
  const [splitType, setSplitType] = useState<SplitMode>('equal');
  const [splitMembers, setSplitMembers] = useState<string[]>([]);
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [percentages, setPercentages] = useState<Record<string, string>>({});
  const [ratios, setRatios] = useState<Record<string, string>>({});
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [attachmentUri, setAttachmentUri] = useState<string | null>(null);
  const [place, setPlace] = useState<CapturedPlace | null>(null);
  const [locEnabled, setLocEnabled] = useState(false);
  const [capturingLoc, setCapturingLoc] = useState(false);
  const [recurEnabled, setRecurEnabled] = useState(false);
  const [recurFreq, setRecurFreq] = useState<RecurFreq>('monthly');
  const [recurInterval, setRecurInterval] = useState('1');
  const [recurEndMs, setRecurEndMs] = useState<number | null>(null);
  const [recurEndMode, setRecurEndMode] = useState<'never' | 'date' | 'count'>('never');
  const [recurCount, setRecurCount] = useState('12');
  const [showEndDate, setShowEndDate] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [snapshot, setSnapshot] = useState<AffordSnapshot | null>(null);

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

          if (txn.kind === 'settlement') {
            setTransferFromId(txn.payments[0]?.personId ?? '');
            setTransferToId(txn.shares[0]?.personId ?? '');
            setTransferScope(txn.group_id);
            setPayMethod((txn.pay_method ?? 'upi'));
            // Reason is now the category (loaded above); the note is the plain note.
            setTransferNote(txn.note ?? '');
          }
          // Reconstruct the split/payers as explicit amounts so a *shared*
          // expense stays editable exactly as it was. In a personal (solo)
          // ledger there's only one member who always owns 100% and is the sole
          // payer, so we keep the auto-following equal split that loadGroup set.
          // Freezing it to exact there would strand a phantom "balance out" /
          // "left to assign" warning — and block saving — the moment the amount
          // is edited, because the frozen shares no longer sum to the new total.
          const personalGroup = grps.find(g => g.id === txn.group_id)?.is_personal === 1;
          if (txn.kind === 'expense' && !personalGroup) {
            setSplitType('exact');
            setSplitMembers(txn.shares.map(s => s.personId));
            setExactAmounts(Object.fromEntries(txn.shares.map(s => [s.personId, (s.amount / 100).toString()])));
            setPayerAmounts(Object.fromEntries(txn.payments.map(p => [p.personId, (p.amount / 100).toString()])));
          }
          // For a recurring "this & future" edit, surface the schedule controls
          // pre-filled so the user can adjust frequency going forward.
          if (recurEditId && txn.recur_freq) {
            setRecurEnabled(true);
            setRecurFreq(txn.recur_freq);
            setRecurInterval(String(txn.recur_interval ?? 1));
            if (txn.recur_end) { setRecurEndMs(txn.recur_end); setRecurEndMode('date'); }
          }
        }
        return;
      }

      // Initial category set must match the starting kind (deep-link ?kind=income
      // / ?kind=transfer never fires a toggle, so load the right catalog here).
      let gid = paramGroupId ?? grps[0]?.id ?? '';
      if (kind === 'income') gid = grps.find(g => g.is_personal === 1)?.id ?? gid;
      setSelectedGroupId(gid);
      if (gid) await loadGroup(gid, meRow, undefined, kind === 'income' ? 'income' : kind === 'transfer' ? 'transfer' : 'expense');
    })();
  }, []);

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
    // Seed the split mode from the group's default (new expenses in shared groups
    // only — editing reconstructs its own split, solo groups stay equal).
    if (!isEditing && mems.length > 1) {
      const g = await getGroupById(db, gid);
      if (g) setSplitType(g.default_split);
    }
  }

  // Transfer: load everyone, default the payer to me, and (re)compute the balance
  // per shared group + combined whenever either side changes.
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

  // With smart-category on, Title (drives category) and Note are separate fields,
  // composed into the single saved note. Otherwise the one field is the note.
  const composedNote = (flags.smartCategory
    ? [title.trim(), note.trim()].filter(Boolean).join(' — ')
    : note.trim()) || undefined;

  function computeShares(): Array<{ personId: string; amount: number }> {
    const selected = members.filter(m => splitMembers.includes(m.id));
    if (selected.length === 0) return [];

    if (splitType === 'equal') {
      const amounts = splitEqual(total, selected.length);
      return selected.map((m, i) => ({ personId: m.id, amount: amounts[i] }));
    }
    if (splitType === 'exact') {
      return selected.map(m => ({ personId: m.id, amount: parseToPaise(exactAmounts[m.id] ?? '0') }));
    }
    if (splitType === 'percent') {
      const pcts = selected.map(m => {
        const p = parseInt(percentages[m.id] ?? '0', 10);
        return Number.isFinite(p) ? p : 0;
      });
      const amounts = splitByPercent(total, pcts);
      return selected.map((m, i) => ({ personId: m.id, amount: amounts[i] }));
    }
    if (splitType === 'shares') {
      const rs = selected.map(m => {
        const r = parseInt(ratios[m.id] ?? '1', 10);
        return Number.isFinite(r) ? r : 1;
      });
      const amounts = splitByShares(total, rs);
      return selected.map((m, i) => ({ personId: m.id, amount: amounts[i] }));
    }
    return [];
  }

  function computePayments(): Array<{ personId: string; amount: number }> {
    if (!me) return [];
    const payers = Object.entries(payerAmounts)
      .map(([pid, val]) => ({ personId: pid, amount: parseToPaise(val) }))
      .filter(p => p.amount > 0);
    if (payers.length === 0 && me) {
      return [{ personId: me.id, amount: total }];
    }
    return payers;
  }

  const shares = kind === 'income' ? [] : computeShares();
  const payments = computePayments();
  const sharesTotal = shares.reduce((s, x) => s + x.amount, 0);
  const paymentsTotal = payments.reduce((s, x) => s + x.amount, 0);
  const remainder = total - sharesTotal;
  const paymentRemainder = total - paymentsTotal;

  // BudgetNudge: how much budget remains in the selected category this month.
  const nudgeStat = selectedCategory ? snapshot?.byCategory[selectedCategory.name] : null;
  const nudgeRemaining = nudgeStat?.budget != null ? nudgeStat.budget - nudgeStat.spentThisMonth : null;
  const nudgePct = nudgeRemaining != null && nudgeStat?.budget ? nudgeRemaining / nudgeStat.budget : null;
  const nudgeColor = nudgePct == null ? null : nudgePct > 0.2 ? colors.income : nudgePct > 0 ? colors.healthAmber : colors.expense;

  const canSave = kind === 'transfer'
    ? (total > 0 && transferFromId !== '' && transferToId !== '' && transferFromId !== transferToId && selectedCategory !== null)
    : (total > 0
        && selectedCategory !== null
        && selectedGroupId !== ''
        && (kind === 'income' || (remainder === 0 && paymentRemainder === 0))
        && (kind === 'income' ? paymentsTotal === total : true));

  // Location tagging — capture once on open when the user has it enabled, and
  // surface it in the form so they can see / clear it before saving.
  async function captureLocation() {
    setCapturingLoc(true);
    try { setPlace(await getCurrentPlace()); } finally { setCapturingLoc(false); }
  }
  useEffect(() => {
    if (isEditing) return;
    (async () => {
      const on = await settings.saveLocation();
      setLocEnabled(on);
      if (on) await captureLocation();
    })();
  }, [isEditing]);

  async function handleSaveTransfer() {
    if (!transferFromId || !transferToId || transferFromId === transferToId || total <= 0) return;
    // Reason is now the chosen transfer category; the note is plain free text.
    const transferCategory = selectedCategory?.name ?? 'Settlement';
    const transferFullNote = transferNote.trim() || undefined;
    setSaving(true);
    try {
      // Editing an existing settlement → update that single row in its group.
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

      // New transfer. Specific group → one row; "All groups" → split largest-first,
      // all rows in the chosen from→to direction.
      const plans = transferScope === 'all'
        ? planAllGroupsSettlement(transferScopes ?? { groups: [], all: { amount: 0, from: transferFromId, to: transferToId } }, total, transferFromId, transferToId)
        : [{ groupId: transferScope, from: transferFromId, to: transferToId, amount: total }];

      // Fallback: "All groups" with no known balances — post the full amount to the
      // first group both belong to (or fail if they share none).
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
      const finalPayments = kind === 'income'
        ? [{ personId: me!.id, amount: total }]
        : payments;
      const finalShares = kind === 'income'
        ? []
        : shares;

      if (isEditing) {
        await updateTxn(db, {
          id: editId!,
          groupId: selectedGroupId,
          kind,
          date: txnDate,
          category: selectedCategory!.name,
          note: composedNote,
          payments: finalPayments,
          shares: finalShares,
        });
        haptic.success();
        router.back();
        return;
      }

      if (isRecurEdit) {
        // "This & future": split the series — past occurrences are preserved,
        // the new values apply from the next occurrence forward.
        await splitRecurringSeries(db, recurEditId!, {
          groupId: selectedGroupId,
          kind,
          entryMode: 'quick',
          date: txnDate, // overridden to the split date inside the query
          category: selectedCategory!.name,
          note: composedNote,
          recurFreq: recurFreq,
          recurInterval: recurFreq === 'custom' ? parseInt(recurInterval, 10) || 1 : undefined,
          currency: currency !== DEFAULT_CURRENCY ? currency : undefined,
          payments: finalPayments,
          shares: finalShares,
        });
        haptic.success();
        router.back();
        return;
      }

      // Resolve the end date from the chosen "Ends" mode. "After N times" is
      // converted to the date of the Nth occurrence so the engine needs no count column.
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
        // Location was captured into `place` on open (when enabled) and may have
        // been cleared by the user — use whatever is in state at save time.
        await insertTxn(db, {
          groupId: selectedGroupId,
          kind,
          entryMode: 'quick',
          date: txnDate,
          category: selectedCategory!.name,
          note: composedNote,
          attachmentUri: attachmentUri ?? undefined,
          recurFreq: recurEnabled ? recurFreq : undefined,
          recurInterval: recurEnabled && recurFreq === 'custom' ? parseInt(recurInterval, 10) || 1 : undefined,
          recurEnd,
          lat: place?.lat,
          lng: place?.lng,
          placeLabel: place?.label ?? undefined,
          currency: currency !== DEFAULT_CURRENCY ? currency : undefined,
          payments: finalPayments,
          shares: finalShares,
        });
        haptic.success();
        router.back();
      };

      // Warn on a likely double-entry (same category + amount within 24h).
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

  return (
    <View style={styles.container}>
      {/* Header: ✕ left · title centered · ✓ save right */}
      <ModalHeader
        title={isRecurEdit ? 'Edit recurring' : isEditing ? (kind === 'income' ? 'Edit income' : kind === 'transfer' ? 'Edit settlement' : 'Edit expense') : (kind === 'income' ? 'Add income' : kind === 'transfer' ? 'Settle up' : 'Add expense')}
        onClose={() => router.back()}
        right={
          <TouchableOpacity onPress={handleSave} disabled={!canSave || saving} hitSlop={10} accessibilityRole="button" accessibilityLabel="Save">
            <Feather name="check" size={24} color={(!canSave || saving) ? colors.textMuted : colors.accent} />
          </TouchableOpacity>
        }
      />

      {/* Expense / Income toggle — centered, just below the title */}
      {!isEditing && !isRecurEdit && (
        <View style={styles.kindToggleRow}>
          <View style={styles.kindRow}>
            <TouchableOpacity
              style={[styles.kindBtn, kind === 'expense' && styles.kindBtnExpenseActive]}
              onPress={() => {
                setKind('expense'); haptic.selection();
                // Reload the expense category set (income/expense have separate catalogs).
                if (selectedGroupId) loadGroup(selectedGroupId, me, undefined, 'expense');
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === 'expense' }}
            >
              <Text style={[styles.kindLabel, kind === 'expense' && styles.kindLabelActive]}>Expense</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.kindBtn, kind === 'transfer' && styles.kindBtnTransferActive]}
              onPress={() => {
                setKind('transfer'); haptic.selection();
                // Transfer reason = a 'transfer' category. They're seeded identically
                // in every group, so load (and create) from the current group.
                const gid = selectedGroupId || groups.find(g => g.is_personal === 1)?.id || groups[0]?.id || '';
                if (gid) loadGroup(gid, me, undefined, 'transfer');
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === 'transfer' }}
            >
              <Text style={[styles.kindLabel, kind === 'transfer' && styles.kindLabelTransferActive]}>Transfer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.kindBtn, kind === 'income' && styles.kindBtnIncomeActive]}
              onPress={() => {
                setKind('income'); haptic.selection();
                // Income is always personal — never a shared group — and uses the
                // income category catalog (not expense).
                const p = groups.find(g => g.is_personal === 1);
                const gid = p?.id ?? selectedGroupId;
                if (p && p.id !== selectedGroupId) setSelectedGroupId(p.id);
                if (gid) loadGroup(gid, me, undefined, 'income');
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === 'income' }}
            >
              <Text style={[styles.kindLabel, kind === 'income' && styles.kindLabelIncomeActive]}>Income</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">

        {/* Large centered amount */}
        <View style={styles.amountBlock}>
          <TextInput
            style={[styles.amountInput, { color: kind === 'income' ? colors.income : kind === 'transfer' ? colors.settle : colors.textPrimary }]}
            value={formatAmountInput(amountText)}
            onChangeText={(t) => setAmountText(sanitizeAmountInput(t))}
            keyboardType="decimal-pad"
            placeholder={kind === 'transfer' && transferScopeBal > 0 ? formatRupees(transferScopeBal) : '₹0'}
            placeholderTextColor={kind === 'income' ? colors.income + '55' : colors.textMuted}
            accessibilityLabel="Amount"
            autoFocus={!isEditing}
          />
          <View style={[styles.amountCursor, { backgroundColor: kind === 'income' ? colors.income : kind === 'transfer' ? colors.settle : colors.accent }]} />
        </View>

        {/* Category + Date pills row — shared selection UI across Expense / Income /
            Transfer. For transfer the category IS the reason. */}
        <View style={styles.pillsRow}>
          <TouchableOpacity
            style={styles.catPill}
            onPress={() => { Keyboard.dismiss(); haptic.light(); setShowCatPicker(true); }}
            accessibilityRole="button"
            accessibilityLabel={selectedCategory ? `${kind === 'transfer' ? 'Reason' : 'Category'}: ${selectedCategory.name}` : (kind === 'transfer' ? 'Choose reason' : 'Choose category')}
          >
            {selectedCategory ? (
              <>
                <View style={[styles.catPillDot, { backgroundColor: (selectedCategory.color ?? colors.accent) + '22' }]}>
                  <Feather name={asFeather(categoryVisual(selectedCategory.name).icon, 'tag')} size={13} color={selectedCategory.color ?? colors.accent} />
                </View>
                <Text style={styles.catPillText}>{selectedCategory.name}</Text>
              </>
            ) : (
              <Text style={styles.catPillPlaceholder}>{kind === 'transfer' ? 'Reason' : 'Category'}</Text>
            )}
            <Feather name="chevron-down" size={12} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.datePill} onPress={() => { Keyboard.dismiss(); setShowDate(true); }} accessibilityRole="button" accessibilityLabel="Date">
            <Text style={styles.datePillText}>
              {isSameDay(new Date(txnDate), new Date()) ? 'Today' : format(new Date(txnDate), 'dd MMM')}
            </Text>
            <Feather name="chevron-down" size={12} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Hidden CategoryPicker controlled by showCatPicker pill */}
        <CategoryPicker
          categories={categories}
          value={selectedCategory}
          hideTrigger
          forceOpen={showCatPicker}
          onClose={() => setShowCatPicker(false)}
          onChange={(c) => {
            setSelectedCategory(c);
            setCatManual(true);
            setShowCatPicker(false);
            if (kind !== 'transfer' && title.trim()) recordCorrection(title, c.name).then(setLearned).catch(() => {});
          }}
          onCreate={async (name) => {
            const created = await insertCategory(db, selectedGroupId, name, 'tag', colors.accent, kind === 'income' ? 'income' : kind === 'transfer' ? 'transfer' : 'expense');
            setCategories(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
            return created;
          }}
        />

        {kind === 'transfer' && (
          <TransferBody
            me={me}
            persons={allPersons}
            fromId={transferFromId}
            toId={transferToId}
            onPickSlot={(slot) => { Keyboard.dismiss(); setTransferSlot(slot); }}
            onSwap={() => { setTransferFromId(transferToId); setTransferToId(transferFromId); }}
            scopes={transferScopes}
            scope={transferScope}
            onScope={setTransferScope}
            payMethod={payMethod}
            onPayMethod={setPayMethod}
            note={transferNote}
            onNote={setTransferNote}
          />
        )}

        {kind !== 'transfer' && (<>

        {/* Group selector — expense only (income is always Personal). Inline chips
            for faster group switching without opening a modal. */}
        {kind === 'expense' && groups.length > 1 && (
          <GroupSelector
            groups={groups}
            selectedId={selectedGroupId}
            onSelect={async (gid) => {
              Keyboard.dismiss();
              setSelectedGroupId(gid);
              await loadGroup(gid, me);
            }}
            label="In"
          />
        )}

        {/* Top field: Title (drives category) when smart-category is on, else the Note. */}
        <View style={styles.noteCard}>
          <TextInput
            style={styles.noteCardInput}
            value={flags.smartCategory ? title : note}
            onChangeText={flags.smartCategory ? onTitleChange : setNote}
            placeholder={flags.smartCategory
              ? (kind === 'income' ? 'e.g. Salary, Freelance, Dividend' : 'e.g. Uber, Groceries, Netflix')
              : (kind === 'income' ? 'Source (optional)' : 'Note (optional)')}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={flags.smartCategory ? 'Title' : 'Note'}
            autoCapitalize="sentences"
            maxLength={80}
          />
        </View>

        {/* Budget nudge — dot + text (green = remaining, red = over) */}
        {kind === 'expense' && nudgeColor != null && nudgeRemaining != null && (
          <View style={styles.nudge}>
            <View style={[styles.nudgeDot, { backgroundColor: nudgeColor }]} />
            <Text style={[styles.nudgeText, { color: nudgeColor }]}>
              {nudgeRemaining >= 0
                ? `${formatCompact(nudgeRemaining)} left in ${selectedCategory!.name} this month`
                : `${formatCompact(-nudgeRemaining)} over budget in ${selectedCategory!.name}`}
            </Text>
          </View>
        )}

        {/* More options — Attach receipt + Recurring. (Income is the header
            toggle; Itemized is a separate FAB action.) */}
        <MoreOptions hint="Split · Attach" forceOpen={isEditing}>
            {/* Note lives here when the top field is the Title (smart-category on). */}
            {flags.smartCategory && (
              <View style={styles.noteCard}>
                <TextInput
                  style={styles.noteCardInput}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Note (optional)"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Note"
                  autoCapitalize="sentences"
                  maxLength={120}
                />
              </View>
            )}

            {/* Split by items — expense-only; income has no items to split. */}
            {!isEditing && kind !== 'income' && (
              <TouchableOpacity
                style={styles.byItemsRow}
                onPress={() => router.push(`/add/itemized${selectedGroupId ? `?groupId=${selectedGroupId}` : ''}` as any)}
                accessibilityRole="button"
                accessibilityLabel="Split by items"
              >
                <Feather name="list" size={16} color={colors.accent} />
                <Text style={styles.byItemsText}>Split by items</Text>
                <Feather name="chevron-right" size={16} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            )}

            {attachmentUri ? (
              <View style={styles.attachRow}>
                <Image source={{ uri: attachmentUri }} style={styles.attachThumb} />
                <Text style={styles.attachName} numberOfLines={1}>Receipt attached</Text>
                <TouchableOpacity onPress={() => setAttachmentUri(null)} hitSlop={10} accessibilityLabel="Remove attachment">
                  <Feather name="x" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.attachBtn}
                onPress={() => {
                  const attach = async (src: 'camera' | 'gallery') => {
                    try {
                      const u = await pickAttachment(src);
                      if (u) setAttachmentUri(u);
                    } catch (e) {
                      // Out of storage — the design lets the user keep going without a photo.
                      if (e instanceof AttachmentStorageError) {
                        Alert.alert(
                          'Photo couldn’t be saved',
                          'Your device is low on storage. Free up space and try again — your expense will still save without the photo.',
                          [
                            { text: 'Storage settings', onPress: () => router.push('/storage' as any) },
                            { text: 'OK', style: 'cancel' },
                          ],
                        );
                      }
                    }
                  };
                  if (Platform.OS === 'ios') {
                    ActionSheetIOS.showActionSheetWithOptions(
                      { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
                      (i) => { if (i === 1) attach('camera'); if (i === 2) attach('gallery'); },
                    );
                  } else {
                    attach('camera');
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel="Attach receipt"
              >
                <Feather name="paperclip" size={16} color={colors.accent} />
                <Text style={styles.attachBtnText}>Attach receipt</Text>
              </TouchableOpacity>
            )}

            {/* Location — shown when the user has location tagging on (Settings). */}
            {locEnabled && !isEditing && (
              <View style={styles.attachRow}>
                <Feather name="map-pin" size={16} color={place ? colors.accent : colors.textMuted} />
                <Text style={styles.attachName} numberOfLines={1}>
                  {capturingLoc ? 'Locating…' : place?.label || (place ? 'Location tagged' : 'No location yet')}
                </Text>
                {place ? (
                  <TouchableOpacity onPress={() => setPlace(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remove location">
                    <Feather name="x" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={captureLocation} hitSlop={10} disabled={capturingLoc} accessibilityRole="button" accessibilityLabel="Capture location">
                    <Feather name="refresh-cw" size={15} color={colors.accent} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Recurring — design: Screens 4, "Recurring expanded inline". */}
            {!isEditing && flags.recurring && (
              <RecurringControls
                enabled={recurEnabled} setEnabled={setRecurEnabled}
                freq={recurFreq} setFreq={setRecurFreq}
                interval={recurInterval} setInterval={setRecurInterval}
                endMode={recurEndMode} setEndMode={setRecurEndMode}
                endMs={recurEndMs} setEndMs={setRecurEndMs}
                count={recurCount} setCount={setRecurCount}
                txnDate={txnDate}
                onPickEndDate={() => setShowEndDate(true)}
              />
            )}
        </MoreOptions>

        {kind === 'expense' && members.length > 1 && total > 0 && (() => {
          const inSplit = members.filter(m => splitMembers.includes(m.id));
          const perEach = inSplit.length > 0 ? Math.round(total / inSplit.length) : 0;
          const summary = splitType === 'equal'
            ? `Equal · ${formatCompact(perEach)} each`
            : splitType.charAt(0).toUpperCase() + splitType.slice(1);
          const payerName = payments.length === 1
            ? (payments[0].personId === me?.id ? 'you' : members.find(m => m.id === payments[0].personId)?.name ?? 'someone')
            : `${payments.length} people`;
          const payers = payments
            .map(p => members.find(m => m.id === p.personId))
            .filter((m): m is Person => !!m);
          return (
            <View>
              {/* Split with [avatars] · Equal · ₹217 each (design Screen 2) */}
              <TouchableOpacity style={styles.splitWithRow} onPress={() => { Keyboard.dismiss(); setShowSplit(true); }} accessibilityRole="button" accessibilityLabel="Configure split">
                <Text style={styles.splitWithLabel}>Split with</Text>
                <View style={styles.splitWithRight}>
                  <AvatarStack people={inSplit} size={24} max={4} />
                  <Text style={styles.splitWithValue}>{summary}</Text>
                </View>
              </TouchableOpacity>
              {/* Who paid — prominent; shows payer avatars when more than one person paid. */}
              <TouchableOpacity style={styles.paidByLine} onPress={() => { Keyboard.dismiss(); setShowPayers(true); }} accessibilityRole="button" accessibilityLabel="Who paid">
                <Text style={styles.paidByLabel}>Paid by</Text>
                {payments.length > 1 && <AvatarStack people={payers} size={20} max={3} />}
                <Text style={styles.paidByValue}>{payerName}</Text>
                <Feather name="chevron-right" size={15} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          );
        })()}

        {kind === 'expense' && total > 0 && (paymentRemainder !== 0 || remainder !== 0) && (
          <Text style={styles.remainderWarning}>
            {paymentRemainder !== 0
              ? paymentRemainder > 0 ? `${formatRupees(paymentRemainder)} left to assign payers` : `${formatRupees(-paymentRemainder)} over-assigned to payers`
              : remainder > 0 ? `${formatRupees(remainder)} unassigned` : `${formatRupees(-remainder)} over-assigned`}
          </Text>
        )}
        </>)}

        {/* No bottom CTA — the ✓ in the header saves. */}
      </ScrollView>
      </KeyboardAvoidingView>

      <SplitSheet
        visible={showSplit}
        onClose={() => setShowSplit(false)}
        members={members}
        splitMembers={splitMembers}
        setSplitMembers={setSplitMembers}
        splitType={splitType}
        setSplitType={setSplitType}
        exactAmounts={exactAmounts}
        setExactAmounts={setExactAmounts}
        percentages={percentages}
        setPercentages={setPercentages}
        ratios={ratios}
        setRatios={setRatios}
        total={total}
        remainder={remainder}
      />

      <DatePickerSheet visible={showDate} value={txnDate} onClose={() => setShowDate(false)} onChange={setTxnDate} />
      <DatePickerSheet
        visible={showEndDate}
        value={recurEndMs ?? (txnDate + 30 * 24 * 60 * 60 * 1000)}
        onClose={() => setShowEndDate(false)}
        onChange={setRecurEndMs}
      />

      {/* Group picker modal removed — replaced by inline GroupSelector chips above. */}

      {/* Transfer: pick the payer / recipient for the active slot */}
      <TransferSlotSheet
        slot={transferSlot}
        persons={allPersons}
        me={me}
        fromId={transferFromId}
        toId={transferToId}
        personNet={personNet}
        onClose={() => setTransferSlot(null)}
        onPick={(pid) => {
          // Keep the two slots distinct: picking a person already in the other slot swaps them.
          if (transferSlot === 'from') {
            if (pid === transferToId) setTransferToId(transferFromId);
            setTransferFromId(pid);
          } else if (transferSlot === 'to') {
            if (pid === transferFromId) setTransferFromId(transferToId);
            setTransferToId(pid);
          }
          setTransferSlot(null);
        }}
      />

      {/* Currency picker hidden for v1 (INR-only). */}

      {/* Paid by sheet — set one or more payers */}
      <PayersSheet
        visible={showPayers}
        onClose={() => setShowPayers(false)}
        members={members}
        me={me}
        payerAmounts={payerAmounts}
        setPayerAmounts={setPayerAmounts}
        total={total}
        paymentRemainder={paymentRemainder}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  // paddingTop clears the native sheet's grabber so the title isn't tucked under it.
  kindToggleRow: { alignItems: 'center', paddingTop: space.xs, paddingBottom: space.sm },
  // Header kind toggle
  kindRow: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 100, padding: 3, borderWidth: 1, borderColor: colors.border },
  kindBtn: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 100 },
  kindBtnExpenseActive: { backgroundColor: colors.accent },
  kindBtnIncomeActive: { backgroundColor: colors.income },
  kindBtnTransferActive: { backgroundColor: colors.settle },
  kindLabel: { fontSize: 11, color: colors.textMuted, fontFamily: 'Inter_600SemiBold' },
  kindLabelActive: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  kindLabelIncomeActive: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  kindLabelTransferActive: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },

  scroll: { padding: layout.screenPaddingH, gap: space.md },
  // Large centered amount
  amountBlock: { alignItems: 'center', paddingBottom: space.md, borderBottomWidth: 1, borderColor: colors.border + '55' },
  // No lineHeight (it clipped the top of the glyphs on iOS); vertical padding gives headroom.
  amountInput: { fontFamily: 'SpaceMono_400Regular', fontSize: 36, textAlign: 'center', letterSpacing: -1.5, paddingVertical: 4, alignSelf: 'stretch', width: '100%' },
  amountCursor: { width: 48, height: 2, borderRadius: 1, marginTop: 4 },

  // Category + date pills row
  pillsRow: { flexDirection: 'row', gap: space.sm },
  catPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgCard, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
  catPillDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  catPillText: { fontSize: 13, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', flex: 1 },
  catPillPlaceholder: { fontSize: 13, color: colors.textMuted, flex: 1 },
  datePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.bgCard, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
  datePillText: { fontSize: 13, color: colors.textSecondary, fontFamily: 'Inter_400Regular' },

  // Note card
  noteCard: { backgroundColor: colors.bgCard, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  noteCardInput: { fontFamily: 'Inter_400Regular', fontSize: 15, color: colors.textPrimary, paddingHorizontal: 14, paddingVertical: 10 },

  // Budget nudge dot style
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bg, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border },
  nudgeDot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  nudgeText: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },

  // More-options expander
  byItemsRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard },
  byItemsText: { ...type.body, color: colors.textPrimary },

  // Recurring purple card (design: Screens 4)
  // Neutral card with the app's teal accent (matches the rest of the app — no off-theme purple).
  // SemiBold on both states so the active pill doesn't change width (no resize on select).

  // Log CTA
  logCta: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: space.sm },
  logCtaText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: colors.bg },
  field: { gap: space.xs },
  smartCatChip: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, paddingVertical: space.xs },
  smartCatDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  smartCatName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  smartCatHint: { ...type.caption, color: colors.textMuted },
  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' as any },
  attachBtnText: { ...type.body, color: colors.accent },
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  attachThumb: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.bgMuted },
  attachName: { ...type.body, color: colors.textPrimary, flex: 1 },
  dateField: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: space.md },
  dateText: { ...type.body, color: colors.textPrimary, flex: 1 },
  // "Split with [avatars] · Equal · ₹217 each" row (design Screen 2)
  splitWithRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.md, borderRadius: radius.md, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  splitWithLabel: { ...type.body, color: colors.textSecondary },
  splitWithRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  splitWithValue: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  paidByLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingTop: space.sm + 2 },
  paidByLabel: { ...type.body, color: colors.textSecondary },
  paidByValue: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  remainderWarning: { ...type.label, color: colors.expense, textAlign: 'center' },
  saveBtn: { marginTop: space.md },
  scheduleBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  splitSheet: { backgroundColor: colors.bgCard, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, gap: space.md, maxHeight: '80%' },
  splitTitle: { ...type.subheading, color: colors.textPrimary },
  splitTypeRow: { flexDirection: 'row', gap: space.xs, backgroundColor: colors.bgMuted, borderRadius: radius.md, padding: 3 },
  splitTypeBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: radius.sm },
  splitTypeActive: { backgroundColor: colors.accent },
  splitTypeLabel: { ...type.caption, color: colors.textSecondary },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  splitName: { ...type.body, color: colors.textPrimary, flex: 1 },
  splitInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, width: 80, textAlign: 'right', borderWidth: 1, borderColor: colors.border },
  eqAmount: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, color: colors.textSecondary },
  endRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  endDateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: space.sm },
  endNeverBtn: { paddingHorizontal: space.md, paddingVertical: space.md, borderRadius: radius.md, backgroundColor: colors.accentMuted, borderWidth: 1, borderColor: colors.accent + '44' },
  endNeverText: { ...type.body, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  doneBtn: { height: 52, backgroundColor: colors.accent, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { ...type.button, color: colors.bg },
});
