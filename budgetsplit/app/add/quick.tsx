import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, Alert, Modal, Pressable,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { format, isSameDay } from 'date-fns';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentPlace } from '../../src/lib/location';
import { colors } from '../../src/constants/colors';
import { asFeather } from '../../src/constants/palette';
import { type } from '../../src/constants/typography';
import { space, radius, layout } from '../../src/constants/layout';
import { DEFAULT_CURRENCY, type CurrencyCode, CURRENCY_MAP } from '../../src/constants/currencies';
import { getAllGroups } from '../../src/db/queries/groups';
import { getGroupMembers, getMe } from '../../src/db/queries/persons';
import { getCategoriesByFrequency, insertCategory } from '../../src/db/queries/categories';
import { insertTxn, updateTxn, getTxnById } from '../../src/db/queries/transactions';
import { parseToPaise, formatRupees, splitEqual, splitByPercent, splitByShares } from '../../src/lib/money';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { CategoryPicker } from '../../src/components/finance/CategoryPicker';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { DatePickerSheet } from '../../src/components/ui/DatePickerSheet';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { AmountText } from '../../src/components/ui/AmountText';
import { haptic } from '../../src/lib/haptics';
import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';
import type { BudgetGroup } from '../../src/db/queries/groups';
import type { Person } from '../../src/db/queries/persons';
import type { Category } from '../../src/db/queries/categories';

type SplitType = 'equal' | 'exact' | 'percent' | 'shares';

export default function QuickAddScreen() {
  const { groupId: paramGroupId, kind: paramKind, editId } = useLocalSearchParams<{ groupId?: string; kind?: string; editId?: string }>();
  const isEditing = !!editId;
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { flags } = useFeatureFlags();

  const [groups, setGroups] = useState<BudgetGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState(paramGroupId ?? '');
  const [kind, setKind] = useState<'income' | 'expense'>(paramKind === 'income' ? 'income' : 'expense');
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
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
  const [recurEnabled, setRecurEnabled] = useState(false);
  const [recurFreq, setRecurFreq] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('monthly');
  const [recurInterval, setRecurInterval] = useState('1');
  const [recurEndMs, setRecurEndMs] = useState<number | null>(null);
  const [showEndDate, setShowEndDate] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);

  useEffect(() => {
    (async () => {
      const grps = await getAllGroups(db);
      setGroups(grps);
      const meRow = await getMe(db);
      setMe(meRow);
      const savedCur = await AsyncStorage.getItem('default_currency');
      if (savedCur) setCurrency(savedCur as CurrencyCode);

      if (editId) {
        const txn = await getTxnById(db, editId);
        if (txn) {
          setSelectedGroupId(txn.group_id);
          await loadGroup(txn.group_id, meRow, txn.category);
          setKind(txn.kind === 'income' ? 'income' : 'expense');
          setTxnDate(txn.date);
          const total = txn.payments.reduce((a, p) => a + p.amount, 0);
          setAmountText((total / 100).toString());
          setNote(txn.note ?? '');
          // Reconstruct the split as explicit amounts so it stays editable.
          if (txn.kind === 'expense') {
            setSplitType('exact');
            setSplitMembers(txn.shares.map(s => s.personId));
            setExactAmounts(Object.fromEntries(txn.shares.map(s => [s.personId, (s.amount / 100).toString()])));
          }
          setPayerAmounts(Object.fromEntries(txn.payments.map(p => [p.personId, (p.amount / 100).toString()])));
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
  }

  const total = parseToPaise(amountText);

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

  const canSave = total > 0
    && selectedCategory !== null
    && selectedGroupId !== ''
    && (kind === 'income' || (remainder === 0 && paymentRemainder === 0))
    && (kind === 'income' ? paymentsTotal === total : true);

  async function handleSave() {
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
          note: note.trim() || undefined,
          payments: finalPayments,
          shares: finalShares,
        });
        haptic.success();
        router.back();
        return;
      }

      // End date is optional; only valid if it's after the start date.
      const recurEnd = (recurEnabled && recurEndMs && recurEndMs > txnDate) ? recurEndMs : undefined;

      // Optional, user-controlled location capture (Settings → Privacy).
      let place: { lat: number; lng: number; label: string | null } | null = null;
      try {
        if ((await AsyncStorage.getItem('save_location')) === 'true') place = await getCurrentPlace();
      } catch { /* best-effort */ }

      await insertTxn(db, {
        groupId: selectedGroupId,
        kind,
        entryMode: 'quick',
        date: txnDate,
        category: selectedCategory!.name,
        note: note.trim() || undefined,
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
    } catch (e) {
      Alert.alert('Error', 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
          <Feather name="x" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{isEditing ? (kind === 'income' ? 'Edit Income' : 'Edit Expense') : (kind === 'income' ? 'Add Income' : 'Add Expense')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Income has its own dedicated screen (add/income); this screen is expense-only. */}

        <View style={styles.amountRow}>
          {/* INR-only for v1 — currency picker hidden; static symbol. */}
          <View style={styles.currencyBadge}>
            <Text style={styles.currencyBadgeText}>{CURRENCY_MAP[currency].symbol}</Text>
          </View>
          <TextInput
            style={styles.amountInput}
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Amount"
            autoFocus={!isEditing}
          />
        </View>

        {groups.length > 1 && (() => {
          const selectedGroup = groups.find(g => g.id === selectedGroupId);
          return (
            <TouchableOpacity
              style={styles.groupSelector}
              onPress={() => setShowGroupPicker(true)}
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

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Category</Text>
          <CategoryPicker
            categories={categories}
            value={selectedCategory}
            onChange={setSelectedCategory}
            onCreate={async (name) => {
              const created = await insertCategory(db, selectedGroupId, name, 'tag', colors.accent);
              setCategories(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
              return created;
            }}
          />
        </View>

        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder="Note (optional)"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Note"
        />

        <Text style={styles.fieldLabel}>{recurEnabled ? 'Starts on' : 'Date'}</Text>
        <TouchableOpacity style={styles.dateField} onPress={() => setShowDate(true)} accessibilityRole="button" accessibilityLabel="Date">
          <Feather name="calendar" size={16} color={colors.accent} />
          <Text style={styles.dateText}>
            {isSameDay(new Date(txnDate), new Date()) ? 'Today' : format(new Date(txnDate), 'EEE, dd MMM yyyy')}
          </Text>
          <Feather name="chevron-right" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {!isEditing && flags.recurring && (
        <TouchableOpacity
          style={styles.scheduleBtn}
          onPress={() => setRecurEnabled(!recurEnabled)}
          accessibilityRole="button"
          accessibilityLabel="Set recurring schedule"
        >
          <View style={styles.scheduleBtnLeft}>
            <Feather name="repeat" size={16} color={recurEnabled ? colors.accent : colors.textSecondary} />
            <Text style={[styles.fieldLabel, recurEnabled && { color: colors.accent }]}>
              {recurEnabled ? `Repeats ${recurFreq}` : 'Set schedule'}
            </Text>
          </View>
          <Feather name={recurEnabled ? 'x' : 'chevron-right'} size={16} color={recurEnabled ? colors.textMuted : colors.textMuted} />
        </TouchableOpacity>
        )}

        {!isEditing && recurEnabled && (
          <View style={styles.recurOptions}>
            <View style={styles.splitTypeRow}>
              {(['daily', 'weekly', 'monthly', 'custom'] as const).map(f => (
                <TouchableOpacity
                  key={f}
                  style={[styles.splitTypeBtn, recurFreq === f && styles.splitTypeActive]}
                  onPress={() => setRecurFreq(f)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: recurFreq === f }}
                >
                  <Text style={[styles.splitTypeLabel, recurFreq === f && { color: colors.bg }]}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {recurFreq === 'custom' && (
              <View style={styles.recurIntervalRow}>
                <Text style={styles.fieldLabel}>Every</Text>
                <TextInput
                  style={styles.recurIntervalInput}
                  value={recurInterval}
                  onChangeText={setRecurInterval}
                  keyboardType="number-pad"
                  placeholder="1"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Interval days"
                />
                <Text style={styles.fieldLabel}>days</Text>
              </View>
            )}

            <Text style={styles.fieldLabel}>Ends</Text>
            <View style={styles.endRow}>
              <TouchableOpacity style={styles.endDateBtn} onPress={() => setShowEndDate(true)} accessibilityRole="button" accessibilityLabel="End date">
                <Feather name="calendar" size={15} color={colors.accent} />
                <Text style={styles.dateText}>{recurEndMs ? format(new Date(recurEndMs), 'dd MMM yyyy') : 'Never'}</Text>
              </TouchableOpacity>
              {recurEndMs != null && (
                <TouchableOpacity style={styles.endNeverBtn} onPress={() => setRecurEndMs(null)} accessibilityRole="button" accessibilityLabel="No end date">
                  <Text style={styles.endNeverText}>Never</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {kind === 'expense' && members.length > 1 && total > 0 && (
          <TouchableOpacity
            style={styles.splitBtn}
            onPress={() => setShowPayers(true)}
            accessibilityRole="button"
            accessibilityLabel="Who paid"
          >
            <Feather name="credit-card" size={16} color={colors.accent} />
            <Text style={styles.splitBtnText}>
              {payments.length === 1
                ? `Paid by ${payments[0].personId === me?.id ? 'you' : members.find(m => m.id === payments[0].personId)?.name ?? 'someone'}`
                : `${payments.length} people paid`}
            </Text>
            {paymentRemainder !== 0 && (
              <Text style={styles.remainder}>
                {paymentRemainder > 0 ? `${formatRupees(paymentRemainder)} left` : `${formatRupees(-paymentRemainder)} over`}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {kind === 'expense' && members.length > 1 && total > 0 && (
          <TouchableOpacity
            style={styles.splitBtn}
            onPress={() => setShowSplit(true)}
            accessibilityRole="button"
            accessibilityLabel="Configure split"
          >
            <Feather name="users" size={16} color={colors.accent} />
            <Text style={styles.splitBtnText}>
              {splitType === 'equal' ? 'Split equally' : `Split (${splitType})`}
            </Text>
            {remainder !== 0 && (
              <Text style={styles.remainder}>
                {remainder > 0 ? `${formatRupees(remainder)} unassigned` : `${formatRupees(-remainder)} over`}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {kind === 'expense' && remainder !== 0 && total > 0 && (
          <Text style={styles.remainderWarning}>
            {remainder > 0 ? `${formatRupees(remainder)} unassigned` : `${formatRupees(-remainder)} over-assigned`}
          </Text>
        )}

        <PrimaryButton
          label="Save"
          onPress={handleSave}
          disabled={!canSave}
          loading={saving}
          style={styles.saveBtn}
        />
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showSplit} transparent animationType="slide" onRequestClose={() => setShowSplit(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowSplit(false)}>
          <Pressable style={styles.splitSheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.splitTitle}>Split</Text>

            <View style={styles.splitTypeRow}>
              {(['equal', 'exact', 'percent', 'shares'] as SplitType[]).map(st => (
                <TouchableOpacity
                  key={st}
                  style={[styles.splitTypeBtn, splitType === st && styles.splitTypeActive]}
                  onPress={() => setSplitType(st)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: splitType === st }}
                >
                  <Text style={[styles.splitTypeLabel, splitType === st && { color: colors.bg }]}>
                    {st.charAt(0).toUpperCase() + st.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView style={{ maxHeight: 300 }}>
              {members.map(m => {
                const included = splitMembers.includes(m.id);
                let inputEl = null;
                if (included && splitType === 'exact') {
                  inputEl = (
                    <TextInput
                      style={styles.splitInput}
                      value={exactAmounts[m.id] ?? ''}
                      onChangeText={v => setExactAmounts(prev => ({ ...prev, [m.id]: v }))}
                      keyboardType="decimal-pad"
                      placeholder="₹0"
                      placeholderTextColor={colors.textMuted}
                    />
                  );
                } else if (included && splitType === 'percent') {
                  inputEl = (
                    <TextInput
                      style={styles.splitInput}
                      value={percentages[m.id] ?? ''}
                      onChangeText={v => setPercentages(prev => ({ ...prev, [m.id]: v }))}
                      keyboardType="number-pad"
                      placeholder="%"
                      placeholderTextColor={colors.textMuted}
                    />
                  );
                } else if (included && splitType === 'shares') {
                  inputEl = (
                    <TextInput
                      style={styles.splitInput}
                      value={ratios[m.id] ?? '1'}
                      onChangeText={v => setRatios(prev => ({ ...prev, [m.id]: v }))}
                      keyboardType="number-pad"
                      placeholder="1"
                      placeholderTextColor={colors.textMuted}
                    />
                  );
                } else if (included && splitType === 'equal') {
                  const idx = splitMembers.indexOf(m.id);
                  const eq = splitEqual(total, splitMembers.length);
                  inputEl = <Text style={styles.eqAmount}>{formatRupees(eq[idx] ?? 0)}</Text>;
                }
                return (
                  <View key={m.id} style={styles.splitRow}>
                    <MemberAvatar name={m.name} color={m.avatar_color} size={36} onPress={() => {
                      setSplitMembers(prev =>
                        prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id]
                      );
                    }} selected={included} />
                    <Text style={styles.splitName}>{m.name}</Text>
                    {inputEl}
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.remainderBar}>
              <Text style={[styles.remainderText, { color: remainder === 0 ? colors.income : colors.expense }]}>
                {remainder === 0
                  ? 'Balanced'
                  : remainder > 0
                  ? `${formatRupees(remainder)} unassigned`
                  : `${formatRupees(-remainder)} over-assigned`}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => setShowSplit(false)}
              accessibilityRole="button"
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

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

      {/* Currency picker hidden for v1 (INR-only). */}

      {/* Paid by sheet — set one or more payers */}
      <SheetModal visible={showPayers} onClose={() => setShowPayers(false)} title="Who paid?">
        <Text style={styles.payerHint}>Set how much each person paid. Leave others blank.</Text>
        {members.map(m => (
          <View key={m.id} style={styles.payerSheetRow}>
            <MemberAvatar name={m.name} color={m.avatar_color} size={36} />
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm },
  title: { ...type.heading, color: colors.textPrimary },
  scroll: { padding: layout.screenPaddingH, gap: space.md, paddingBottom: space.lg },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  currencyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.bgMuted, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, borderWidth: 1, borderColor: colors.border },
  currencyBadgeText: { fontFamily: 'SpaceMono_400Regular', fontSize: 18, color: colors.textPrimary },
  amountInput: { flex: 1, fontFamily: 'SpaceMono_400Regular', fontSize: 40, color: colors.textPrimary, textAlign: 'center', borderBottomWidth: 1, borderColor: colors.border, paddingBottom: space.sm },
  field: { gap: space.xs },
  fieldLabel: { ...type.label, color: colors.textSecondary },
  groupSelector: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: space.sm + 2 },
  groupSelectorIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  groupSelectorLabel: { ...type.caption, color: colors.textMuted },
  groupSelectorName: { ...type.body, color: colors.textPrimary },
  groupPickerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2, paddingHorizontal: space.sm, borderRadius: radius.md },
  groupPickerRowActive: { backgroundColor: colors.accentMuted },
  groupPickerIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  groupPickerName: { ...type.body, color: colors.textPrimary, flex: 1 },
  noteInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border },
  dateField: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: space.md },
  dateText: { ...type.body, color: colors.textPrimary, flex: 1 },
  splitBtn: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  splitBtnText: { ...type.body, color: colors.accent, flex: 1 },
  remainder: { ...type.label, color: colors.expense },
  remainderWarning: { ...type.label, color: colors.expense, textAlign: 'center' },
  saveBtn: { marginTop: space.md },
  scheduleBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: space.sm + 2 },
  scheduleBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  recurOptions: { gap: space.sm, backgroundColor: colors.bgCard, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border },
  recurIntervalRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  recurIntervalInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, width: 60, textAlign: 'center', borderWidth: 1, borderColor: colors.border },
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
  endNeverBtn: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: colors.bgMuted },
  endNeverText: { ...type.label, color: colors.textSecondary },
  doneBtn: { height: 52, backgroundColor: colors.accent, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { ...type.button, color: colors.bg },
});
