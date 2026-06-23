import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert, Switch,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { format, isSameDay } from 'date-fns';
import { colors } from '../../src/constants/colors';
import { asFeather } from '../../src/constants/palette';
import { type } from '../../src/constants/typography';
import { space, radius, layout } from '../../src/constants/layout';
import { getAllGroups } from '../../src/db/queries/groups';
import { getMe } from '../../src/db/queries/persons';
import { getCategoriesByFrequency, insertCategory } from '../../src/db/queries/categories';
import { insertTxn, updateTxn, getTxnById, splitRecurringSeries } from '../../src/db/queries/transactions';
import { parseToPaise, formatRupees } from '../../src/lib/money';
import { getBudgetAnalytics } from '../../src/lib/analytics';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { Input } from '../../src/components/ui/Input';
import { CategoryPicker } from '../../src/components/finance/CategoryPicker';
import { DatePickerSheet } from '../../src/components/ui/DatePickerSheet';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { haptic } from '../../src/lib/haptics';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';
import type { BudgetGroup } from '../../src/db/queries/groups';
import type { Person } from '../../src/db/queries/persons';
import type { Category } from '../../src/db/queries/categories';

const SOURCE_CHIPS = [
  { label: 'Salary',     emoji: '💼' },
  { label: 'Freelance',  emoji: '🧑‍💻' },
  { label: 'Investment', emoji: '📈' },
  { label: 'Other',      emoji: '💰' },
];

type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
const FREQS: { key: Freq; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
  { key: 'custom', label: 'Custom' },
];

export default function AddIncomeScreen() {
  const { groupId: paramGroupId, editId, recurEditId } = useLocalSearchParams<{ groupId?: string; editId?: string; recurEditId?: string }>();
  const isEditing = !!editId;
  const isRecurEdit = !!recurEditId; // "this & future" edit of a recurring series
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { flags } = useFeatureFlags();

  const [groups, setGroups] = useState<BudgetGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState(paramGroupId ?? '');
  const [me, setMe] = useState<Person | null>(null);
  const [amountText, setAmountText] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
  const [sourceChip, setSourceChip] = useState<string>('Salary');
  const [budgetAllocated, setBudgetAllocated] = useState(0);
  const [budgetSpent, setBudgetSpent] = useState(0);
  const amtRef = useRef<TextInput>(null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(Date.now());
  const [showDate, setShowDate] = useState(false);
  const [recurOn, setRecurOn] = useState(false);
  const [freq, setFreq] = useState<Freq>('monthly');
  const [recurInterval, setRecurInterval] = useState('1');
  const [recurEndMs, setRecurEndMs] = useState<number | null>(null);
  const [showEndDate, setShowEndDate] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [grps, meRow] = await Promise.all([getAllGroups(db), getMe(db)]);
      // Income is your own money → personal ledger only (never shared groups).
      const personal = grps.filter(g => g.is_personal === 1);
      setGroups(personal);
      setMe(meRow);
      const loadId = editId ?? recurEditId;
      if (loadId) {
        const txn = await getTxnById(db, loadId);
        if (txn) {
          setSelectedGroupId(txn.group_id);
          await loadCats(txn.group_id, txn.category);
          const total = txn.payments.reduce((a, p) => a + p.amount, 0);
          setAmountText((total / 100).toString());
          setNote(txn.note ?? '');
          setDate(txn.date);
          // Recurring "this & future" edit: pre-fill the schedule controls.
          if (recurEditId && txn.recur_freq) {
            setRecurOn(true);
            if (txn.recur_freq === 'custom') {
              // ~yearly interval maps back to the 'yearly' chip; otherwise it's a real custom interval.
              if ((txn.recur_interval ?? 0) >= 365) setFreq('yearly');
              else { setFreq('custom'); setRecurInterval(String(txn.recur_interval ?? 1)); }
            } else {
              setFreq(txn.recur_freq as Freq);
            }
            if (txn.recur_end) setRecurEndMs(txn.recur_end);
          }
          setLoadError(false);
          return;
        }
        Alert.alert('Not found', "This income entry no longer exists.");
        router.back();
        return;
      }
      const gid = (paramGroupId && personal.some(g => g.id === paramGroupId)) ? paramGroupId : personal[0]?.id ?? '';
      setSelectedGroupId(gid);
      if (gid) {
        await loadCats(gid);
        const grpObj = grps.find(g => g.id === gid);
        if (grpObj) {
          const analytics = await getBudgetAnalytics(db, grpObj);
          setBudgetAllocated(analytics.totalAllocated);
          setBudgetSpent(analytics.totalSpent);
        }
      }
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }

  async function loadCats(gid: string, preselect?: string) {
    const cats = await getCategoriesByFrequency(db, gid, 'income');
    setCategories(cats);
    setCategory((preselect ? cats.find(c => c.name === preselect) : null) ?? cats[0] ?? null);
  }

  const total = parseToPaise(amountText);
  const canSave = total > 0 && !!category && !!selectedGroupId;

  async function handleSave() {
    if (!canSave || saving || !me) return;
    setSaving(true);
    try {
      if (isRecurEdit) {
        // "This & future": split the series; past income entries are preserved.
        await splitRecurringSeries(db, recurEditId!, {
          groupId: selectedGroupId, kind: 'income', entryMode: 'quick', date,
          category: category!.name, note: note.trim() || undefined,
          recurFreq: (freq === 'yearly' || freq === 'custom') ? 'custom' : freq,
          recurInterval: freq === 'custom' ? (parseInt(recurInterval, 10) || 1) : freq === 'yearly' ? 365 : undefined,
          payments: [{ personId: me.id, amount: total }], shares: [],
        });
      } else if (isEditing) {
        await updateTxn(db, {
          id: editId!, groupId: selectedGroupId, kind: 'income', date,
          category: category!.name, note: note.trim() || undefined,
          payments: [{ personId: me.id, amount: total }], shares: [],
        });
      } else {
        await insertTxn(db, {
          groupId: selectedGroupId, kind: 'income', entryMode: 'quick', date,
          category: category!.name, note: note.trim() || undefined,
          recurFreq: recurOn ? ((freq === 'yearly' || freq === 'custom') ? 'custom' : freq) : undefined,
          recurInterval: recurOn ? (freq === 'custom' ? (parseInt(recurInterval, 10) || 1) : freq === 'yearly' ? 365 : undefined) : undefined,
          recurEnd: recurOn && recurEndMs && recurEndMs > date ? recurEndMs : undefined,
          payments: [{ personId: me.id, amount: total }], shares: [],
        });
      }
      haptic.success();
      router.back();
    } catch {
      Alert.alert('Error', 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const surplus = total + (budgetAllocated - budgetSpent);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.headerClose} accessibilityRole="button" accessibilityLabel="Close">
          <Feather name="x" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{isRecurEdit ? 'Edit Recurring' : isEditing ? 'Edit Income' : 'Add entry'}</Text>
        {/* Expense / Income toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity onPress={() => router.replace('/add/quick?kind=expense')} style={styles.modeBtn} accessibilityRole="button">
            <Text style={styles.modeBtnText}>Expense</Text>
          </TouchableOpacity>
          <View style={styles.modeBtnActive}>
            <Text style={styles.modeBtnActiveText}>Income</Text>
          </View>
        </View>
      </View>

      {loadError ? (
        <ErrorState onRetry={() => { setLoadError(false); load(); }} />
      ) : (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Large amount display */}
          <TouchableOpacity style={styles.amountWrap} onPress={() => amtRef.current?.focus()} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Edit amount">
            <TextInput
              ref={amtRef}
              style={styles.amountInput}
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              placeholder="₹0"
              placeholderTextColor={colors.income + '66'}
              autoFocus={!isEditing}
              accessibilityLabel="Amount"
            />
            <Text style={styles.amountHint}>tap to edit</Text>
          </TouchableOpacity>

          {/* Source + date row */}
          <View style={styles.sourceRow}>
            <TouchableOpacity style={styles.sourcePill} onPress={() => {}} accessibilityRole="button" accessibilityLabel="Select source">
              <Text style={styles.sourcePillEmoji}>{SOURCE_CHIPS.find(s => s.label === sourceChip)?.emoji ?? '💼'}</Text>
              <Text style={styles.sourcePillText}>{sourceChip}</Text>
              <Feather name="chevron-down" size={12} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.datePill} onPress={() => setShowDate(true)} accessibilityRole="button" accessibilityLabel="Select date">
              <Text style={styles.datePillText}>
                {isSameDay(new Date(date), new Date()) ? 'Today' : format(new Date(date), 'dd MMM')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Note */}
          <View style={styles.noteWrap}>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="Note (optional)"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Note"
              maxLength={80}
            />
          </View>

          {/* Budget impact nudge */}
          {budgetAllocated > 0 && total > 0 && (
            <View style={styles.nudgeCard}>
              <View style={styles.nudgeDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.nudgeTitle}>
                  {surplus > 0
                    ? `Month covered + ${formatRupees(surplus)} surplus`
                    : `${formatRupees(Math.abs(surplus))} short of monthly budget`}
                </Text>
                <Text style={styles.nudgeSub}>
                  Based on {formatRupees(budgetAllocated)} budget · {formatRupees(budgetSpent)} spent so far
                </Text>
              </View>
            </View>
          )}

          {/* SOURCE chips */}
          <View style={styles.sourceChipsWrap}>
            <Text style={styles.sourceChipsLabel}>SOURCE</Text>
            <View style={styles.sourceChipsRow}>
              {SOURCE_CHIPS.map(s => (
                <TouchableOpacity
                  key={s.label}
                  style={[styles.sourceChip, sourceChip === s.label && styles.sourceChipActive]}
                  onPress={() => {
                    setSourceChip(s.label);
                    haptic.selection();
                    // Sync to matching category if it exists
                    const match = categories.find(c => c.name.toLowerCase() === s.label.toLowerCase());
                    if (match) setCategory(match);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sourceChip === s.label }}
                >
                  <Text style={styles.sourceChipEmoji}>{s.emoji}</Text>
                  <Text style={[styles.sourceChipText, sourceChip === s.label && styles.sourceChipTextActive]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Group selector (multi-account) */}
          {groups.length > 1 && (() => {
            const selectedGroup = groups.find(g => g.id === selectedGroupId);
            return (
              <TouchableOpacity
                style={styles.groupSelector}
                onPress={() => setShowGroupPicker(true)}
                accessibilityRole="button"
                accessibilityLabel="Select group"
              >
                <View style={[styles.groupSelectorIcon, { backgroundColor: (selectedGroup?.color ?? colors.income) + '22' }]}>
                  <Feather name={asFeather(selectedGroup?.icon, 'layers')} size={16} color={selectedGroup?.color ?? colors.income} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.groupSelectorLabel}>Account / Group</Text>
                  <Text style={styles.groupSelectorName}>{selectedGroup?.name ?? 'Select'}</Text>
                </View>
                <Feather name="chevron-down" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            );
          })()}

          {/* Recurring toggle */}
          {!isEditing && flags.recurring && (
            <>
              <View style={styles.scheduleRow}>
                <Text style={[styles.fieldLabel, recurOn && { color: colors.income }]}>
                  {recurOn ? `Repeats ${freq}` : 'Repeat this (e.g. salary)'}
                </Text>
                <Switch
                  value={recurOn}
                  onValueChange={setRecurOn}
                  trackColor={{ true: colors.income, false: colors.bgMuted }}
                  thumbColor={colors.textPrimary}
                  accessibilityLabel="Repeat on a schedule"
                />
              </View>
              {recurOn && (
                <View style={styles.recurOptions}>
                  <View style={styles.freqRow}>
                    {FREQS.map(f => (
                      <TouchableOpacity
                        key={f.key}
                        style={[styles.freqChip, freq === f.key && styles.freqChipActive]}
                        onPress={() => setFreq(f.key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: freq === f.key }}
                      >
                        <Text style={[styles.freqText, freq === f.key && styles.freqTextActive]}>{f.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {freq === 'custom' && (
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
                      <Feather name="calendar" size={15} color={colors.income} />
                      <Text style={styles.dateText}>{recurEndMs && Number.isFinite(recurEndMs) ? format(new Date(recurEndMs), 'dd MMM yyyy') : 'Never'}</Text>
                    </TouchableOpacity>
                    {recurEndMs != null && (
                      <TouchableOpacity style={styles.endNeverBtn} onPress={() => setRecurEndMs(null)} accessibilityRole="button">
                        <Text style={styles.endNeverText}>Never</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            </>
          )}

          {/* Green CTA */}
          <TouchableOpacity
            style={[styles.incomeCta, (!canSave || saving) && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={!canSave || saving}
            accessibilityRole="button"
            accessibilityLabel={total > 0 ? `Log ${formatRupees(total)} income` : 'Log income'}
          >
            <Text style={styles.incomeCtaText}>
              {saving ? 'Saving…' : total > 0 ? `Log ${formatRupees(total)} income` : isEditing ? 'Save' : 'Log income'}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      )}

      <DatePickerSheet visible={showDate} value={date} onClose={() => setShowDate(false)} onChange={setDate} />
      <DatePickerSheet visible={showEndDate} value={recurEndMs ?? Date.now()} onClose={() => setShowEndDate(false)} onChange={(ms) => { setRecurEndMs(ms); setShowEndDate(false); }} />

      <SheetModal visible={showGroupPicker} onClose={() => setShowGroupPicker(false)} title="Select group" scroll={false}>
        {groups.map(g => (
          <TouchableOpacity
            key={g.id}
            style={[styles.groupPickerRow, selectedGroupId === g.id && styles.groupPickerRowActive]}
            onPress={async () => { setSelectedGroupId(g.id); await loadCats(g.id); setShowGroupPicker(false); }}
            accessibilityRole="button"
          >
            <View style={[styles.groupPickerIcon, { backgroundColor: g.color + '22' }]}>
              <Feather name={asFeather(g.icon, 'layers')} size={16} color={g.color} />
            </View>
            <Text style={styles.groupPickerName}>{g.name}</Text>
            {selectedGroupId === g.id && <Feather name="check" size={18} color={colors.income} />}
          </TouchableOpacity>
        ))}
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm, minHeight: 52 },
  title: { ...type.heading, color: colors.textPrimary },
  headerClose: { minWidth: 44, alignItems: 'flex-start', justifyContent: 'center', height: 44 },

  // Mode toggle pill
  modeToggle: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 100, padding: 3, borderWidth: 1, borderColor: colors.border, gap: 2 },
  modeBtn: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 100 },
  modeBtnText: { fontSize: 12, color: colors.textMuted, fontFamily: 'Inter_400Regular' },
  modeBtnActive: { paddingVertical: 5, paddingHorizontal: 12, backgroundColor: colors.income, borderRadius: 100 },
  modeBtnActiveText: { fontSize: 12, color: colors.bg, fontFamily: 'Inter_600SemiBold' },

  scroll: { padding: layout.screenPaddingH, gap: space.md },

  // Amount — large centered display
  amountWrap: { alignItems: 'center', borderBottomWidth: 1, borderColor: colors.border + '66', paddingBottom: space.md },
  amountInput: { fontFamily: 'SpaceMono_400Regular', fontSize: 44, color: colors.income, textAlign: 'center', letterSpacing: -2, lineHeight: 52 },
  amountHint: { fontSize: 12, color: colors.textMuted, marginTop: 4 },

  // Source + date row
  sourceRow: { flexDirection: 'row', gap: space.sm },
  sourcePill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgCard, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  sourcePillEmoji: { fontSize: 14 },
  sourcePillText: { fontSize: 13, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', flex: 1 },
  datePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  datePillText: { fontSize: 13, color: colors.textSecondary, fontFamily: 'Inter_400Regular' },

  // Note
  noteWrap: { backgroundColor: colors.bgCard, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  noteInput: { ...type.body, color: colors.textPrimary, paddingHorizontal: 14, paddingVertical: 10 },

  // Budget nudge
  nudgeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.bg, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border },
  nudgeDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.income, marginTop: 3, flexShrink: 0 },
  nudgeTitle: { fontSize: 12, color: colors.income, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  nudgeSub: { fontSize: 11, color: colors.textMuted, lineHeight: 15 },

  // Source chips
  sourceChipsWrap: { gap: 8 },
  sourceChipsLabel: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Inter_600SemiBold' },
  sourceChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sourceChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.bgCard, borderRadius: 100, borderWidth: 1, borderColor: colors.border },
  sourceChipActive: { backgroundColor: colors.income, borderColor: colors.income },
  sourceChipEmoji: { fontSize: 13 },
  sourceChipText: { fontSize: 12, color: colors.textSecondary, fontFamily: 'Inter_400Regular' },
  sourceChipTextActive: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },

  // Green CTA
  incomeCta: { backgroundColor: colors.income, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: space.sm },
  incomeCtaText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: colors.bg },

  field: { gap: space.xs },
  fieldLabel: { ...type.label, color: colors.textSecondary },
  dateText: { ...type.body, color: colors.textPrimary, flex: 1 },
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingLeft: space.md, paddingRight: space.sm, paddingVertical: space.xs },
  recurOptions: { gap: space.sm, backgroundColor: colors.bgCard, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border },
  endRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  endDateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: space.sm },
  endNeverBtn: { paddingHorizontal: space.md, paddingVertical: space.md, borderRadius: radius.md, backgroundColor: colors.accentMuted, borderWidth: 1, borderColor: colors.accent + '44' },
  endNeverText: { ...type.body, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  recurIntervalRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  recurIntervalInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgCard, borderRadius: radius.md, paddingHorizontal: space.md, height: 44, minWidth: 64, textAlign: 'center', borderWidth: 1, borderColor: colors.border },
  freqChip: { flex: 1, paddingVertical: space.sm, alignItems: 'center', borderRadius: radius.sm, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: 'transparent' },
  freqChipActive: { backgroundColor: colors.accentMuted, borderColor: colors.income },
  freqText: { ...type.caption, color: colors.textSecondary },
  freqTextActive: { color: colors.income, fontFamily: 'Inter_600SemiBold' },
  groupSelector: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: space.sm + 2 },
  groupSelectorIcon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  groupSelectorLabel: { ...type.caption, color: colors.textMuted },
  groupSelectorName: { ...type.body, color: colors.textPrimary },
  groupPickerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2, paddingHorizontal: space.md, borderRadius: radius.md },
  groupPickerRowActive: { backgroundColor: colors.accentMuted },
  groupPickerIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  groupPickerName: { ...type.body, color: colors.textPrimary, flex: 1 },
});
