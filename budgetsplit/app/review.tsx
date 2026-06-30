import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { getPending, deletePending, clearPending, type PendingTxn } from '../src/db/queries/pending';
import { insertTxn } from '../src/db/queries/transactions';
import { getMe } from '../src/db/queries/persons';
import { getAllGroups } from '../src/db/queries/groups';
import { getCategoriesForGroup } from '../src/db/queries/categories';
import { parseToPaise } from '../src/lib/money';
import { useScreenData } from '../src/hooks/useScreenData';
import { useDataRefresh } from '../src/components/system/DataRefreshProvider';
import { haptic } from '../src/lib/haptics';
import type { TxnKind } from '../src/constants/enums';

type RowEdit = { kind: TxnKind; category: string; amount: string };

export default function ReviewScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useDataRefresh();
  const [edits, setEdits] = useState<Record<string, Partial<RowEdit>>>({});

  const { data, loading, error, reload } = useScreenData(async (db) => {
    const me = await getMe(db);
    const groups = await getAllGroups(db);
    const personalId = groups.find(g => g.is_personal === 1)?.id ?? groups[0]?.id ?? '';
    const [pending, expenseCats, incomeCats] = await Promise.all([
      getPending(db),
      personalId ? getCategoriesForGroup(db, personalId, 'expense') : Promise.resolve([]),
      personalId ? getCategoriesForGroup(db, personalId, 'income') : Promise.resolve([]),
    ]);
    return {
      pending, meId: me?.id ?? '', personalId,
      expenseCats: expenseCats.map(c => c.name),
      incomeCats: incomeCats.map(c => c.name),
    };
  }, []);

  const pending = data?.pending ?? [];

  function eff(row: PendingTxn): RowEdit {
    const e = edits[row.id] ?? {};
    return {
      kind: e.kind ?? (row.kind === 'settlement' ? 'expense' : row.kind),
      category: e.category ?? row.category ?? '',
      amount: e.amount ?? String(row.amount / 100),
    };
  }
  const patch = (id: string, p: Partial<RowEdit>) => setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...p } }));

  async function confirmRow(row: PendingTxn) {
    const v = eff(row);
    const amount = parseToPaise(v.amount);
    if (amount <= 0 || !data?.personalId || !data?.meId) return;
    await insertTxn(db, {
      groupId: data.personalId,
      kind: v.kind,
      entryMode: 'quick',
      date: row.date,
      category: v.category || (v.kind === 'income' ? 'Other Income' : 'Other'),
      note: row.description,
      payments: [{ personId: data.meId, amount }],
      shares: [{ personId: data.meId, amount }],
    });
    await deletePending(db, row.id);
    haptic.success();
    refresh();
    reload();
  }

  async function discardRow(row: PendingTxn) {
    await deletePending(db, row.id);
    haptic.warning();
    refresh();
    reload();
  }

  /** Hand a row to the full editor (split / transfer / fine-tune), then drop the pending row. */
  async function openInEditor(row: PendingTxn) {
    const v = eff(row);
    await deletePending(db, row.id);
    refresh();
    router.push(`/add/quick?kind=${v.kind === 'income' ? 'income' : 'expense'}&amount=${row.amount}&note=${encodeURIComponent(row.description)}&date=${row.date}` as any);
  }

  async function handleClearAll() {
    await clearPending(db);
    haptic.warning();
    refresh();
    reload();
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Review"
        onBack={() => router.back()}
        right={pending.length > 0 ? (
          <TouchableOpacity onPress={handleClearAll} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear all">
            <Text style={styles.clearAll}>Clear all</Text>
          </TouchableOpacity>
        ) : undefined}
      />
      {error ? (
        <ErrorState onRetry={reload} />
      ) : loading ? null : pending.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="Nothing to review"
          body="Import a bank or UPI statement (Settings → Import) and the transactions show up here to confirm."
          actionLabel="Import transactions"
          onAction={() => router.push('/import' as any)}
        />
      ) : (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.xl }]}>
          <Text style={styles.intro}>{pending.length} to review · confirm each, or fine-tune in the editor.</Text>
          {pending.map(row => {
            const v = eff(row);
            const cats = v.kind === 'income' ? (data?.incomeCats ?? []) : (data?.expenseCats ?? []);
            return (
              <View key={row.id} style={styles.card}>
                <View style={styles.rowTop}>
                  <Text style={styles.desc} numberOfLines={1}>{row.description}</Text>
                  <Text style={styles.date}>{format(row.date, 'd MMM')}</Text>
                </View>

                {/* Amount + type */}
                <View style={styles.amountRow}>
                  <View style={styles.amtWrap}>
                    <Text style={styles.rupee}>₹</Text>
                    <TextInput
                      style={styles.amtInput}
                      value={v.amount}
                      onChangeText={(t) => patch(row.id, { amount: t.replace(/[^0-9.]/g, '') })}
                      keyboardType="decimal-pad"
                      accessibilityLabel="Amount"
                    />
                  </View>
                  <View style={styles.kindToggle}>
                    {(['expense', 'income'] as TxnKind[]).map(k => (
                      <TouchableOpacity
                        key={k}
                        style={[styles.kindBtn, v.kind === k && (k === 'income' ? styles.kindIncome : styles.kindExpense)]}
                        onPress={() => { haptic.selection(); patch(row.id, { kind: k, category: '' }); }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: v.kind === k }}
                      >
                        <Text style={[styles.kindText, v.kind === k && styles.kindTextOn]}>{k === 'income' ? 'Income' : 'Expense'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Category quick chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow} keyboardShouldPersistTaps="handled">
                  {cats.map(c => {
                    const on = v.category === c;
                    return (
                      <TouchableOpacity key={c} style={[styles.catChip, on && styles.catChipOn]} onPress={() => { haptic.selection(); patch(row.id, { category: c }); }} accessibilityRole="button" accessibilityState={{ selected: on }}>
                        <Text style={[styles.catChipText, on && styles.catChipTextOn]}>{c}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Actions */}
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.editorLink} onPress={() => openInEditor(row)} accessibilityRole="button" accessibilityLabel="Open in editor to split or transfer">
                    <Feather name="sliders" size={14} color={colors.textSecondary} />
                    <Text style={styles.editorLinkText}>Split / transfer</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity style={styles.discardBtn} onPress={() => discardRow(row)} accessibilityRole="button" accessibilityLabel="Discard">
                    <Feather name="x" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => confirmRow(row)} accessibilityRole="button" accessibilityLabel="Confirm">
                    <Feather name="check" size={16} color={colors.bg} />
                    <Text style={styles.confirmText}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.sm },
  intro: { ...type.label, color: colors.textMuted, marginBottom: space.xs },
  clearAll: { ...type.label, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm, ...shadow.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  desc: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', flex: 1 },
  date: { ...type.caption, color: colors.textMuted },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  amtWrap: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.sm, flex: 1 },
  rupee: { ...type.body, color: colors.textMuted },
  amtInput: { flex: 1, ...type.body, color: colors.textPrimary, fontFamily: 'SpaceMono_400Regular', paddingVertical: 8 },
  kindToggle: { flexDirection: 'row', backgroundColor: colors.bgMuted, borderRadius: radius.md, padding: 2 },
  kindBtn: { paddingHorizontal: space.sm + 2, paddingVertical: 6, borderRadius: radius.sm },
  kindExpense: { backgroundColor: colors.expense },
  kindIncome: { backgroundColor: colors.income },
  kindText: { ...type.label, color: colors.textSecondary },
  kindTextOn: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  catRow: { gap: 6, paddingVertical: 2 },
  catChip: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: colors.border },
  catChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  catChipText: { ...type.label, color: colors.textSecondary },
  catChipTextOn: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  editorLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editorLinkText: { ...type.label, color: colors.textSecondary },
  discardBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgMuted },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.md, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.accent },
  confirmText: { ...type.label, color: colors.bg, fontFamily: 'Inter_600SemiBold' },
});
