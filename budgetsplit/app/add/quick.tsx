import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, Alert, Modal, Pressable, Switch, Image,
  Platform, ActionSheetIOS, Keyboard, KeyboardAvoidingView,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { TransferBody } from '../../src/components/finance/TransferBody';
import { computeTransferScopes, planAllGroupsSettlement, type TransferScopes } from '../../src/lib/settleScope';
import { getCategoriesByFrequency, insertCategory } from '../../src/db/queries/categories';
import { insertTxn, updateTxn, getTxnById, splitRecurringSeries, findRecentDuplicate, recordSettlement } from '../../src/db/queries/transactions';
import { parseToPaise, formatRupees, formatCompact, splitEqual, splitByPercent, splitByShares, formatAmountInput, sanitizeAmountInput } from '../../src/lib/money';
import { getAffordSnapshot, type AffordSnapshot } from '../../src/db/queries/savings';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { CategoryPicker } from '../../src/components/finance/CategoryPicker';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { DatePickerSheet } from '../../src/components/ui/DatePickerSheet';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { SplitSheet } from '../../src/components/finance/add/SplitSheet';
import { AvatarStack } from '../../src/components/finance/AvatarStack';
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

type SplitType = 'equal' | 'exact' | 'percent' | 'shares';

export default function QuickAddScreen() {
  const { groupId: paramGroupId, kind: paramKind, editId, recurEditId, from: paramFrom, to: paramTo, amount: paramAmount } =
    useLocalSearchParams<{ groupId?: string; kind?: string; editId?: string; recurEditId?: string; from?: string; to?: string; amount?: string }>();
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
  const [transferFromId, setTransferFromId] = useState(paramFrom ?? '');
  const [transferToId, setTransferToId] = useState(paramTo ?? '');
  const [transferSlot, setTransferSlot] = useState<'from' | 'to' | null>(null); // which slot the picker fills
  // Launched from a group's FAB → pre-select that group's transfer scope.
  const [transferScope, setTransferScope] = useState<'all' | string>(paramGroupId ?? 'all');
  const [transferScopes, setTransferScopes] = useState<TransferScopes | null>(null);
  const [payMethod, setPayMethod] = useState<'upi' | 'cash' | 'bank'>('upi');
  const [transferNote, setTransferNote] = useState('');
  const [note, setNote] = useState('');
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
  const [txnDate, setTxnDate] = useState(Date.now());
  const [showDate, setShowDate] = useState(false);
  const [splitType, setSplitType] = useState<SplitType>('equal');
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
  const [recurFreq, setRecurFreq] = useState<'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'>('monthly');
  const [recurInterval, setRecurInterval] = useState('1');
  const [recurEndMs, setRecurEndMs] = useState<number | null>(null);
  const [recurEndMode, setRecurEndMode] = useState<'never' | 'date' | 'count'>('never');
  const [recurCount, setRecurCount] = useState('12');
  const [showEndDate, setShowEndDate] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
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
          await loadGroup(txn.group_id, meRow, txn.category);
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

      const gid = paramGroupId ?? grps[0]?.id ?? '';
      setSelectedGroupId(gid);
      if (gid) await loadGroup(gid, meRow);
    })();
  }, []);

  async function loadGroup(gid: string, meRow: Person | null, preselectCategory?: string) {
    const [cats, mems] = await Promise.all([
      getCategoriesByFrequency(db, gid),
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
    ? (total > 0 && transferFromId !== '' && transferToId !== '' && transferFromId !== transferToId)
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
    setSaving(true);
    try {
      // Editing an existing settlement → update that single row in its group.
      if (isEditing) {
        await updateTxn(db, {
          id: editId!, groupId: transferScope === 'all' ? selectedGroupId : transferScope,
          kind: 'settlement', date: txnDate, category: 'Settlement',
          note: transferNote.trim() || undefined, payMethod,
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
          date: txnDate, note: transferNote.trim() || undefined, payMethod,
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
              onPress={() => { setKind('expense'); haptic.selection(); }}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === 'expense' }}
            >
              <Text style={[styles.kindLabel, kind === 'expense' && styles.kindLabelActive]}>Expense</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.kindBtn, kind === 'transfer' && styles.kindBtnTransferActive]}
              onPress={() => { setKind('transfer'); haptic.selection(); }}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === 'transfer' }}
            >
              <Text style={[styles.kindLabel, kind === 'transfer' && styles.kindLabelTransferActive]}>Transfer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.kindBtn, kind === 'income' && styles.kindBtnIncomeActive]}
              onPress={() => {
                setKind('income'); haptic.selection();
                // Income is always personal — never a shared group.
                const p = groups.find(g => g.is_personal === 1);
                if (p && p.id !== selectedGroupId) { setSelectedGroupId(p.id); loadGroup(p.id, me); }
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === 'income' }}
            >
              <Text style={[styles.kindLabel, kind === 'income' && styles.kindLabelIncomeActive]}>Income</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

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
        {/* Category + Date pills row */}
        <View style={styles.pillsRow}>
          <TouchableOpacity
            style={styles.catPill}
            onPress={() => { Keyboard.dismiss(); haptic.light(); setShowCatPicker(true); }}
            accessibilityRole="button"
            accessibilityLabel={selectedCategory ? `Category: ${selectedCategory.name}` : 'Choose category'}
          >
            {selectedCategory ? (
              <>
                <View style={[styles.catPillDot, { backgroundColor: (selectedCategory.color ?? colors.accent) + '22' }]}>
                  <Feather name={asFeather(categoryVisual(selectedCategory.name).icon, 'tag')} size={13} color={selectedCategory.color ?? colors.accent} />
                </View>
                <Text style={styles.catPillText}>{selectedCategory.name}</Text>
              </>
            ) : (
              <Text style={styles.catPillPlaceholder}>Category</Text>
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
            if (title.trim()) recordCorrection(title, c.name).then(setLearned).catch(() => {});
          }}
          onCreate={async (name) => {
            const created = await insertCategory(db, selectedGroupId, name, 'tag', colors.accent);
            setCategories(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
            return created;
          }}
        />

        {/* Group selector — expense only (income is always Personal). Picking a real
            group loads its members, which enables the split row below. */}
        {kind === 'expense' && groups.length > 1 && (() => {
          const selectedGroup = groups.find(g => g.id === selectedGroupId);
          return (
            <TouchableOpacity
              style={styles.groupSelector}
              onPress={() => { Keyboard.dismiss(); setShowGroupPicker(true); }}
              accessibilityRole="button"
              accessibilityLabel="Select group"
            >
              <View style={[styles.groupSelectorIcon, { backgroundColor: (selectedGroup?.color ?? colors.accent) + '22' }]}>
                <Feather name={asFeather(selectedGroup?.icon, 'layers')} size={16} color={selectedGroup?.color ?? colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.groupSelectorLabel}>Group</Text>
                <Text style={styles.groupSelectorName}>{selectedGroup?.name ?? 'Select'}</Text>
              </View>
              <Feather name="chevron-down" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          );
        })()}

        {/* Top field: Title (drives category) when smart-category is on, else the Note. */}
        <View style={styles.noteCard}>
          <TextInput
            style={styles.noteCardInput}
            value={flags.smartCategory ? title : note}
            onChangeText={flags.smartCategory ? onTitleChange : setNote}
            placeholder={flags.smartCategory ? 'e.g. Uber, Groceries, Netflix' : 'Note (optional)'}
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

            {/* Split by items — opens the separate itemized screen, carrying the group. */}
            {!isEditing && (
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
              recurEnabled ? (
                <View style={styles.recurCard}>
                  <View style={styles.recurHeader}>
                    <View style={styles.recurDot} />
                    <Text style={styles.recurTitle}>Recurring</Text>
                    <TouchableOpacity onPress={() => setRecurEnabled(false)} hitSlop={10} style={{ marginLeft: 'auto' }} accessibilityRole="button" accessibilityLabel="Turn off recurring">
                      <Feather name="chevron-up" size={18} color={colors.settle} />
                    </TouchableOpacity>
                  </View>

                  {/* Frequency */}
                  <View style={styles.recurSection}>
                    <Text style={styles.recurSectionLabel}>FREQUENCY</Text>
                    <View style={styles.recurPills}>
                      {(['monthly', 'weekly', 'yearly', 'custom'] as const).map(f => (
                        <TouchableOpacity
                          key={f}
                          style={[styles.recurPill, recurFreq === f && styles.recurPillActive]}
                          onPress={() => setRecurFreq(f)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: recurFreq === f }}
                        >
                          <Text style={[styles.recurPillText, recurFreq === f && styles.recurPillTextActive]}>
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {recurFreq === 'custom' && (
                      <View style={[styles.recurIntervalRow, { marginTop: space.sm }]}>
                        <Text style={styles.recurRowLabel}>Every</Text>
                        <TextInput
                          style={styles.recurIntervalInput}
                          value={recurInterval}
                          onChangeText={setRecurInterval}
                          keyboardType="number-pad"
                          placeholder="1"
                          placeholderTextColor={colors.textMuted}
                          accessibilityLabel="Interval days"
                        />
                        <Text style={styles.recurRowLabel}>days</Text>
                      </View>
                    )}
                  </View>

                  {/* Next charge — the occurrence after the start date */}
                  <View style={styles.recurRow}>
                    <Text style={styles.recurRowLabel}>Next charge</Text>
                    <View style={styles.recurDateChip}>
                      <Text style={styles.recurDateChipText}>
                        {format(new Date(nthOccurrenceMs(txnDate, recurFreq, recurFreq === 'custom' ? (parseInt(recurInterval, 10) || 1) : 1, 2)), 'dd MMM yyyy')}
                      </Text>
                    </View>
                  </View>

                  {/* Ends — Never / On date / After N */}
                  <View style={styles.recurRow}>
                    <Text style={styles.recurRowLabel}>Ends</Text>
                    <View style={styles.recurEndPills}>
                      <TouchableOpacity
                        style={[styles.recurChip, recurEndMode === 'never' && styles.recurPillActive]}
                        onPress={() => { setRecurEndMode('never'); setRecurEndMs(null); }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: recurEndMode === 'never' }}
                      >
                        <Text style={[styles.recurChipText, recurEndMode === 'never' && styles.recurPillTextActive]}>Never</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.recurChip, recurEndMode === 'date' && styles.recurPillActive]}
                        onPress={() => { setRecurEndMode('date'); Keyboard.dismiss(); setShowEndDate(true); }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: recurEndMode === 'date' }}
                      >
                        <Text style={[styles.recurChipText, recurEndMode === 'date' && styles.recurPillTextActive]}>On date</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.recurChip, recurEndMode === 'count' && styles.recurPillActive]}
                        onPress={() => setRecurEndMode('count')}
                        accessibilityRole="button"
                        accessibilityState={{ selected: recurEndMode === 'count' }}
                      >
                        <Text style={[styles.recurChipText, recurEndMode === 'count' && styles.recurPillTextActive]}>After N</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {recurEndMode === 'date' && recurEndMs != null && (
                    <TouchableOpacity style={styles.recurEndDate} onPress={() => { Keyboard.dismiss(); setShowEndDate(true); }} accessibilityRole="button" accessibilityLabel="Change end date">
                      <Feather name="calendar" size={13} color={colors.settle} />
                      <Text style={styles.recurEndDateText}>Ends {format(new Date(recurEndMs!), 'dd MMM yyyy')}</Text>
                    </TouchableOpacity>
                  )}
                  {recurEndMode === 'count' && (
                    <View style={styles.recurCountRow}>
                      <Text style={styles.recurRowLabel}>After</Text>
                      <TextInput
                        style={styles.recurIntervalInput}
                        value={recurCount}
                        onChangeText={setRecurCount}
                        keyboardType="number-pad"
                        placeholder="12"
                        placeholderTextColor={colors.textMuted}
                        accessibilityLabel="Number of occurrences"
                      />
                      <Text style={styles.recurRowLabel}>times</Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.scheduleRow}>
                  <Text style={styles.fieldLabel}>Repeat this</Text>
                  <Switch
                    value={recurEnabled}
                    onValueChange={setRecurEnabled}
                    trackColor={{ true: colors.settle, false: colors.bgMuted }}
                    thumbColor={colors.textPrimary}
                    accessibilityLabel="Repeat on a schedule"
                  />
                </View>
              )
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
        <View style={{ height: 32 }} />
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

      <SheetModal visible={showGroupPicker} onClose={() => setShowGroupPicker(false)} title="Select group" scroll={false}>
        {groups.map(g => (
          <TouchableOpacity
            key={g.id}
            style={[styles.groupPickerRow, selectedGroupId === g.id && styles.groupPickerRowActive]}
            onPress={async () => { setSelectedGroupId(g.id); await loadGroup(g.id, me); setShowGroupPicker(false); }}
            accessibilityRole="button"
          >
            <View style={[styles.groupPickerIcon, { backgroundColor: g.color + '22' }]}>
              <Feather name={asFeather(g.icon, 'layers')} size={16} color={g.color} />
            </View>
            <Text style={styles.groupPickerName}>{g.name}</Text>
            {selectedGroupId === g.id && <Feather name="check" size={18} color={colors.accent} />}
          </TouchableOpacity>
        ))}
      </SheetModal>

      {/* Transfer: pick the payer / recipient for the active slot */}
      <SheetModal visible={transferSlot !== null} onClose={() => setTransferSlot(null)} title={transferSlot === 'from' ? 'Who paid?' : 'Who received?'} scroll={false}>
        {allPersons.map(p => {
          const active = transferSlot === 'from' ? p.id === transferFromId : p.id === transferToId;
          return (
            <TouchableOpacity
              key={p.id}
              style={[styles.groupPickerRow, active && styles.groupPickerRowActive]}
              onPress={() => {
                // Keep the two slots distinct: picking a person already in the other slot swaps them.
                if (transferSlot === 'from') {
                  if (p.id === transferToId) setTransferToId(transferFromId);
                  setTransferFromId(p.id);
                } else if (transferSlot === 'to') {
                  if (p.id === transferFromId) setTransferFromId(transferToId);
                  setTransferToId(p.id);
                }
                setTransferSlot(null);
              }}
              accessibilityRole="button"
            >
              <MemberAvatar name={p.name} color={p.avatar_color} size={36} imageUri={p.image_uri} />
              <Text style={styles.groupPickerName}>{p.id === me?.id ? `${p.name} (you)` : p.name}</Text>
              {active && <Feather name="check" size={18} color={colors.accent} />}
            </TouchableOpacity>
          );
        })}
      </SheetModal>

      {/* Currency picker hidden for v1 (INR-only). */}

      {/* Paid by sheet — set one or more payers */}
      <SheetModal visible={showPayers} onClose={() => setShowPayers(false)} title="Who paid?">
        <Text style={styles.payerHint}>Set how much each person paid. Leave others blank.</Text>
        {members.map(m => (
          <View key={m.id} style={styles.payerSheetRow}>
            <MemberAvatar name={m.name} color={m.avatar_color} size={36} imageUri={m.image_uri} />
            <Text style={styles.payerSheetName} numberOfLines={1}>{m.name}{m.is_me ? ' (you)' : ''}</Text>
            <View style={styles.payerInputWrap}>
              <Text style={styles.payerRupee}>₹</Text>
              <TextInput
                style={styles.payerSheetInput}
                value={payerAmounts[m.id] ?? ''}
                onChangeText={v => setPayerAmounts(prev => ({ ...prev, [m.id]: v }))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>
        ))}
        <TouchableOpacity
          style={styles.payerQuickBtn}
          onPress={() => me && setPayerAmounts({ [me.id]: (total / 100).toString() })}
          accessibilityRole="button"
        >
          <Feather name="user" size={14} color={colors.accent} />
          <Text style={styles.payerQuickText}>I paid the whole bill</Text>
        </TouchableOpacity>
        <View style={styles.remainderBar}>
          <Text style={[styles.remainderText, { color: paymentRemainder === 0 ? colors.income : colors.expense }]}>
            {paymentRemainder === 0 ? 'Balanced' : paymentRemainder > 0 ? `${formatRupees(paymentRemainder)} left to assign` : `${formatRupees(-paymentRemainder)} over`}
          </Text>
        </View>
        <PrimaryButton label="Done" onPress={() => setShowPayers(false)} disabled={paymentRemainder !== 0} />
      </SheetModal>
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
  noteCardInput: { ...type.body, color: colors.textPrimary, paddingHorizontal: 14, paddingVertical: 10 },

  // Budget nudge dot style
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bg, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border },
  nudgeDot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  nudgeText: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },

  // More-options expander
  byItemsRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard },
  byItemsText: { ...type.body, color: colors.textPrimary },

  // Recurring purple card (design: Screens 4)
  // Neutral card with the app's teal accent (matches the rest of the app — no off-theme purple).
  recurCard: { backgroundColor: colors.settle + '14', borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.settle, overflow: 'hidden' },
  recurHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.settle + '33' },
  recurDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.settle },
  recurTitle: { ...type.body, color: colors.settle, fontFamily: 'Inter_600SemiBold' },
  recurRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, paddingVertical: space.sm + 2, borderTopWidth: 1, borderTopColor: colors.settle + '33' },
  recurRowLabel: { ...type.body, color: colors.textSecondary },
  recurSection: { paddingHorizontal: space.md, paddingVertical: space.sm + 2 },
  recurSectionLabel: { ...type.caption, color: colors.settle, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Inter_600SemiBold', marginBottom: space.sm },
  recurPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  recurPill: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.settle + '44' },
  recurPillActive: { backgroundColor: colors.settle, borderColor: colors.settle },
  recurDateChip: { backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.settle + '44', paddingHorizontal: space.sm + 2, paddingVertical: 6 },
  recurDateChipText: { ...type.label, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  recurCountRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.sm + 2 },
  // SemiBold on both states so the active pill doesn't change width (no resize on select).
  recurPillText: { ...type.label, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  recurPillTextActive: { color: '#fff' },
  recurChip: { paddingHorizontal: space.sm + 2, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.settle + '44' },
  recurChipText: { ...type.label, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  recurEndPills: { flexDirection: 'row', gap: 6 },
  recurEndDate: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, paddingBottom: space.sm + 2 },
  recurEndDateText: { ...type.label, color: colors.settle, fontFamily: 'Inter_600SemiBold' },

  // Log CTA
  logCta: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: space.sm },
  logCtaText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: colors.bg },
  field: { gap: space.xs },
  smartCatChip: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, paddingVertical: space.xs },
  smartCatDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  smartCatName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  smartCatHint: { ...type.caption, color: colors.textMuted },
  fieldLabel: { ...type.label, color: colors.textSecondary },
  groupSelector: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: space.sm + 2 },
  groupSelectorIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  groupSelectorLabel: { ...type.caption, color: colors.textMuted },
  groupSelectorName: { ...type.body, color: colors.textPrimary },
  groupPickerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2, paddingHorizontal: space.sm, borderRadius: radius.md },
  groupPickerRowActive: { backgroundColor: colors.accentMuted },
  groupPickerIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  groupPickerName: { ...type.body, color: colors.textPrimary, flex: 1 },
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
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingLeft: space.md, paddingRight: space.sm, paddingVertical: space.xs },
  scheduleBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  recurOptions: { gap: space.sm, backgroundColor: colors.bgCard, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border },
  recurIntervalRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  recurIntervalInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, paddingHorizontal: space.md, height: 44, minWidth: 64, textAlign: 'center', borderWidth: 1, borderColor: colors.border },
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
  remainderBar: { paddingVertical: space.sm, alignItems: 'center', borderTopWidth: 1, borderColor: colors.border },
  remainderText: { ...type.label, fontFamily: 'Inter_600SemiBold' },
  payerHint: { ...type.caption, color: colors.textMuted },
  payerSheetRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  payerSheetName: { ...type.body, color: colors.textPrimary, flex: 1 },
  payerInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgInput, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.sm, minWidth: 100 },
  payerRupee: { ...type.body, color: colors.textMuted },
  payerSheetInput: { ...type.body, color: colors.textPrimary, flex: 1, textAlign: 'right', paddingVertical: space.sm, paddingLeft: 2 },
  payerQuickBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: colors.accentMuted },
  payerQuickText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  endRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  endDateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: space.sm },
  endNeverBtn: { paddingHorizontal: space.md, paddingVertical: space.md, borderRadius: radius.md, backgroundColor: colors.accentMuted, borderWidth: 1, borderColor: colors.accent + '44' },
  endNeverText: { ...type.body, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  doneBtn: { height: 52, backgroundColor: colors.accent, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { ...type.button, color: colors.bg },
});
