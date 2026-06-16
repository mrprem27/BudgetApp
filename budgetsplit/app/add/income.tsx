import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { format, isSameDay } from 'date-fns';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, radius, layout } from '../../src/constants/layout';
import { getAllGroups } from '../../src/db/queries/groups';
import { getMe } from '../../src/db/queries/persons';
import { getCategoriesByFrequency, insertCategory } from '../../src/db/queries/categories';
import { insertTxn, updateTxn, getTxnById } from '../../src/db/queries/transactions';
import { parseToPaise } from '../../src/lib/money';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { CategoryPicker } from '../../src/components/finance/CategoryPicker';
import { DatePickerSheet } from '../../src/components/ui/DatePickerSheet';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { haptic } from '../../src/lib/haptics';
import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';
import type { BudgetGroup } from '../../src/db/queries/groups';
import type { Person } from '../../src/db/queries/persons';
import type { Category } from '../../src/db/queries/categories';

type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';
const FREQS: { key: Freq; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

export default function AddIncomeScreen() {
  const { groupId: paramGroupId, editId } = useLocalSearchParams<{ groupId?: string; editId?: string }>();
  const isEditing = !!editId;
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
  const [note, setNote] = useState('');
  const [date, setDate] = useState(Date.now());
  const [showDate, setShowDate] = useState(false);
  const [recurOn, setRecurOn] = useState(false);
  const [freq, setFreq] = useState<Freq>('monthly');
  const [recurEndMs, setRecurEndMs] = useState<number | null>(null);
  const [showEndDate, setShowEndDate] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [grps, meRow] = await Promise.all([getAllGroups(db), getMe(db)]);
      setGroups(grps);
      setMe(meRow);
      if (editId) {
        const txn = await getTxnById(db, editId);
        if (txn) {
          setSelectedGroupId(txn.group_id);
          await loadCats(txn.group_id, txn.category);
          const total = txn.payments.reduce((a, p) => a + p.amount, 0);
          setAmountText((total / 100).toString());
          setNote(txn.note ?? '');
          setDate(txn.date);
          return;
        }
      }
      const gid = paramGroupId ?? grps[0]?.id ?? '';
      setSelectedGroupId(gid);
      if (gid) await loadCats(gid);
    })();
  }, []);

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
      if (isEditing) {
        await updateTxn(db, {
          id: editId!, groupId: selectedGroupId, kind: 'income', date,
          category: category!.name, note: note.trim() || undefined,
          payments: [{ personId: me.id, amount: total }], shares: [],
        });
      } else {
        await insertTxn(db, {
          groupId: selectedGroupId, kind: 'income', entryMode: 'quick', date,
          category: category!.name, note: note.trim() || undefined,
          recurFreq: recurOn ? (freq === 'yearly' ? 'custom' : freq) : undefined,
          recurInterval: recurOn && freq === 'yearly' ? 365 : undefined,
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

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
          <Feather name="x" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{isEditing ? 'Edit Income' : 'Add Income'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Amount */}
          <View style={styles.amountWrap}>
            <Feather name="trending-up" size={20} color={colors.income} />
            <TextInput
              style={styles.amountInput}
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              placeholder="₹0.00"
              placeholderTextColor={colors.textMuted}
              autoFocus={!isEditing}
              accessibilityLabel="Amount"
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
                <View style={[styles.groupSelectorIcon, { backgroundColor: (selectedGroup?.color ?? colors.income) + '22' }]}>
                  <Feather name={(selectedGroup?.icon ?? 'layers') as any} size={16} color={selectedGroup?.color ?? colors.income} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.groupSelectorLabel}>Account / Group</Text>
                  <Text style={styles.groupSelectorName}>{selectedGroup?.name ?? 'Select'}</Text>
                </View>
                <Feather name="chevron-down" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            );
          })()}

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Source</Text>
            <CategoryPicker
              categories={categories}
              value={category}
              onChange={setCategory}
              onCreate={async (name) => {
                const created = await insertCategory(db, selectedGroupId, name, 'plus-circle', colors.income, 'income', 'Income');
                setCategories(prev => [...prev, created]);
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

          <TouchableOpacity style={styles.dateField} onPress={() => setShowDate(true)} accessibilityRole="button">
            <Feather name="calendar" size={16} color={colors.income} />
            <Text style={styles.dateText}>
              {isSameDay(new Date(date), new Date()) ? 'Today' : format(new Date(date), 'EEE, dd MMM yyyy')}
            </Text>
            <Feather name="chevron-right" size={16} color={colors.textMuted} />
          </TouchableOpacity>

          {!isEditing && flags.recurring && (
            <>
              <TouchableOpacity
                style={styles.scheduleBtn}
                onPress={() => setRecurOn(!recurOn)}
                accessibilityRole="button"
                accessibilityLabel="Set recurring schedule"
              >
                <View style={styles.scheduleBtnLeft}>
                  <Feather name="repeat" size={16} color={recurOn ? colors.income : colors.textSecondary} />
                  <Text style={[styles.fieldLabel, recurOn && { color: colors.income }]}>
                    {recurOn ? `Repeats ${freq}` : 'Set schedule (e.g. salary)'}
                  </Text>
                </View>
                <Feather name={recurOn ? 'x' : 'chevron-right'} size={16} color={colors.textMuted} />
              </TouchableOpacity>
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
                  <Text style={styles.fieldLabel}>Ends</Text>
                  <View style={styles.endRow}>
                    <TouchableOpacity style={styles.endDateBtn} onPress={() => setShowEndDate(true)} accessibilityRole="button" accessibilityLabel="End date">
                      <Feather name="calendar" size={15} color={colors.income} />
                      <Text style={styles.dateText}>{recurEndMs ? format(new Date(recurEndMs), 'dd MMM yyyy') : 'Never'}</Text>
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

          <PrimaryButton label={isEditing ? 'Save Income' : 'Add Income'} onPress={handleSave} disabled={!canSave} loading={saving} style={{ marginTop: space.md }} />
        </ScrollView>
      </KeyboardAvoidingView>

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
              <Feather name={g.icon as any} size={16} color={g.color} />
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm },
  title: { ...type.heading, color: colors.textPrimary },
  scroll: { padding: layout.screenPaddingH, gap: space.md, paddingBottom: space.lg },
  amountWrap: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderBottomWidth: 1, borderColor: colors.border, paddingBottom: space.sm },
  amountInput: { flex: 1, fontFamily: 'SpaceMono_400Regular', fontSize: 40, color: colors.textPrimary, textAlign: 'center' },
  field: { gap: space.xs },
  fieldLabel: { ...type.label, color: colors.textSecondary },
  chipRow: { flexDirection: 'row', gap: space.xs, paddingBottom: space.xs },
  groupChip: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.bgMuted },
  groupChipActive: { backgroundColor: colors.income },
  groupChipText: { ...type.label, color: colors.textSecondary },
  noteInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border },
  dateField: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: space.md },
  dateText: { ...type.body, color: colors.textPrimary, flex: 1 },
  recurRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.xs },
  scheduleBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: space.sm + 2 },
  scheduleBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  recurOptions: { gap: space.sm, backgroundColor: colors.bgCard, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border },
  endRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  endDateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: space.sm },
  endNeverBtn: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: colors.bgMuted },
  endNeverText: { ...type.label, color: colors.textSecondary },
  freqRow: { flexDirection: 'row', gap: space.xs },
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
