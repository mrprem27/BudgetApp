import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../../../src/constants/colors';
import { type } from '../../../src/constants/typography';
import { space, radius, layout, shadow } from '../../../src/constants/layout';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { PrimaryButton } from '../../../src/components/ui/PrimaryButton';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { CategoryPicker } from '../../../src/components/finance/CategoryPicker';
import { SheetModal } from '../../../src/components/ui/SheetModal';
import { getCategoriesByFrequency } from '../../../src/db/queries/categories';
import { getCategoryBudgets, setCategoryBudgets } from '../../../src/db/queries/categoryBudgets';
import type { BudgetCadence } from '../../../src/db/queries/categoryBudgets';
import { categoryVisual } from '../../../src/constants/categories';
import { parseToPaise, formatRupees } from '../../../src/lib/money';
import { haptic } from '../../../src/lib/haptics';
import type { Category } from '../../../src/db/queries/categories';

type Row = { category: string; cadence: BudgetCadence; amount: string };

const CADENCES: { key: BudgetCadence; label: string }[] = [
  { key: 'once', label: 'One-time' },
  { key: 'daily', label: 'Daily' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

// Approximate monthly cost of a line, for a single comparable headline number.
function monthlyEquivalent(cadence: BudgetCadence, paise: number): number {
  switch (cadence) {
    case 'daily':   return paise * 30;
    case 'monthly': return paise;
    case 'yearly':  return Math.round(paise / 12);
    case 'once':    return 0; // not periodic
  }
}

export default function BudgetEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [cadenceSheetFor, setCadenceSheetFor] = useState<string | null>(null);
  const [defaultCadence, setDefaultCadence] = useState<BudgetCadence>('monthly');
  const [loadError, setLoadError] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, [id]));

  async function load() {
    if (!id) return;
    try {
      const [cats, budgets, dc] = await Promise.all([
        getCategoriesByFrequency(db, id),
        getCategoryBudgets(db, id),
        AsyncStorage.getItem('default_cadence'),
      ]);
      if (dc) setDefaultCadence(dc as BudgetCadence);
      setAllCategories(cats);
      setRows(budgets.filter(b => b.amount > 0).map(b => ({
        category: b.category, cadence: b.cadence, amount: (b.amount / 100).toString(),
      })));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }

  const monthlyApprox = rows.reduce((s, r) => s + monthlyEquivalent(r.cadence, parseToPaise(r.amount)), 0);
  const usedNames = new Set(rows.map(r => r.category));
  const available = allCategories.filter(c => !usedNames.has(c.name));

  function addRow(name: string) {
    if (usedNames.has(name)) return;
    setRows(prev => [...prev, { category: name, cadence: defaultCadence, amount: '' }]);
  }
  function setAmount(category: string, amount: string) {
    setRows(prev => prev.map(r => r.category === category ? { ...r, amount } : r));
  }
  function setCadence(category: string, cadence: BudgetCadence) {
    haptic.selection();
    setRows(prev => prev.map(r => r.category === category ? { ...r, cadence } : r));
  }
  function removeRow(category: string) {
    Alert.alert(`Remove ${category} budget?`, 'It will no longer be tracked once you save.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setRows(prev => prev.filter(r => r.category !== category)) },
    ]);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const entries = rows
        .map(r => ({ category: r.category, cadence: r.cadence, amount: parseToPaise(r.amount) }))
        .filter(e => e.amount > 0);
      await setCategoryBudgets(db, id, entries);
      haptic.success();
      router.back();
    } catch {
      haptic.error();
      Alert.alert("Couldn't save", 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Set Budget" onBack={() => router.back()} />
      {loadError ? (
        <ErrorState onRetry={() => { setLoadError(false); load(); }} />
      ) : (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>≈ Monthly commitment</Text>
            <Text style={styles.totalAmount}>{formatRupees(monthlyApprox)}</Text>
            <Text style={styles.totalSub}>
              {rows.length} {rows.length === 1 ? 'category' : 'categories'} · one-time not counted
            </Text>
          </View>

          <Text style={styles.explain}>
            Pick a cadence per category. Daily, monthly and yearly budgets repeat each period — the limit resets and unused amount doesn't carry over; one-time doesn't repeat.
          </Text>

          {rows.length > 0 ? (
            rows.map(r => {
              const vis = categoryVisual(r.category);
              return (
                <View key={r.category} style={styles.rowCard}>
                  <View style={styles.rowTop}>
                    <View style={[styles.iconDot, { backgroundColor: vis.color + '22' }]}>
                      <Feather name={vis.icon} size={16} color={vis.color} />
                    </View>
                    <Text style={styles.rowName} numberOfLines={1}>{r.category}</Text>
                    <View style={styles.amountWrap}>
                      <Text style={styles.rupee}>₹</Text>
                      <TextInput
                        style={styles.amountInput}
                        value={r.amount}
                        onChangeText={v => setAmount(r.category, v)}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        accessibilityLabel={`${r.category} budget`}
                      />
                    </View>
                    <TouchableOpacity onPress={() => removeRow(r.category)} hitSlop={8} accessibilityLabel={`Remove ${r.category}`}>
                      <Feather name="x" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={styles.cadenceSelect}
                    onPress={() => setCadenceSheetFor(r.category)}
                    accessibilityRole="button"
                    accessibilityLabel={`Cadence: ${CADENCES.find(c => c.key === r.cadence)?.label}`}
                  >
                    <Feather name="repeat" size={13} color={colors.textSecondary} />
                    <Text style={styles.cadenceSelectText}>{CADENCES.find(c => c.key === r.cadence)?.label ?? 'Monthly'}</Text>
                    <Feather name="chevron-down" size={14} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              );
            })
          ) : (
            <EmptyState icon="target" title="No categories budgeted" body="Add a category below and choose how often its budget applies." />
          )}

          {available.length > 0 && (
            <>
              <Text style={styles.addLabel}>Add a category</Text>
              <CategoryPicker categories={available} value={null} onChange={c => addRow(c.name)} />
            </>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <PrimaryButton label="Save Budget" onPress={handleSave} loading={saving} />
        </View>
      </KeyboardAvoidingView>
      )}

      <SheetModal visible={!!cadenceSheetFor} onClose={() => setCadenceSheetFor(null)} title="How often?" scroll={false}>
        {CADENCES.map(c => {
          const active = cadenceSheetFor ? rows.find(r => r.category === cadenceSheetFor)?.cadence === c.key : false;
          return (
            <TouchableOpacity
              key={c.key}
              style={[styles.cadOption, active && styles.cadOptionActive]}
              onPress={() => { if (cadenceSheetFor) setCadence(cadenceSheetFor, c.key); setCadenceSheetFor(null); }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.cadOptionText, active && { color: colors.accent, fontFamily: 'Inter_600SemiBold' }]}>{c.label}</Text>
              {active && <Feather name="check" size={18} color={colors.accent} />}
            </TouchableOpacity>
          );
        })}
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.md },
  totalCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, alignItems: 'center', gap: 4, ...shadow.md },
  totalLabel: { ...type.label, color: colors.textSecondary },
  totalAmount: { ...type.amountXL, color: colors.accent },
  totalSub: { ...type.caption, color: colors.textMuted },
  explain: { ...type.caption, color: colors.textMuted, lineHeight: 16 },
  rowCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm, ...shadow.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  iconDot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  rowName: { ...type.body, color: colors.textPrimary, flex: 1, fontFamily: 'Inter_600SemiBold' },
  amountWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgInput, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.sm, minWidth: 92 },
  rupee: { ...type.body, color: colors.textMuted },
  amountInput: { ...type.body, color: colors.textPrimary, flex: 1, textAlign: 'right', paddingVertical: space.sm, paddingLeft: 2 },
  cadenceSelect: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', paddingHorizontal: space.sm, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.bgMuted },
  cadenceSelectText: { ...type.caption, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  cadOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.md, paddingHorizontal: space.md, borderRadius: radius.md },
  cadOptionActive: { backgroundColor: colors.accentMuted },
  cadOptionText: { ...type.body, color: colors.textPrimary },
  addLabel: { ...type.label, color: colors.textSecondary },
  footer: { paddingHorizontal: layout.screenPaddingH, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
});
