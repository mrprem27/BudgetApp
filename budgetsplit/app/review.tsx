import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { categoryVisual } from '../src/constants/categories';
import { asFeather } from '../src/constants/palette';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { SheetModal } from '../src/components/ui/SheetModal';
import { CategoryPicker } from '../src/components/finance/CategoryPicker';
import { getPending, deletePending, clearPending, type PendingTxn } from '../src/db/queries/pending';
import { insertTxn } from '../src/db/queries/transactions';
import { getMe } from '../src/db/queries/persons';
import { getAllGroups } from '../src/db/queries/groups';
import { getCategories, type Category } from '../src/db/queries/categories';
import { parseToPaise, formatRupees } from '../src/lib/money';
import { useScreenData } from '../src/hooks/useScreenData';
import { useDataRefresh } from '../src/components/system/DataRefreshProvider';
import { haptic } from '../src/lib/haptics';
import type { TxnKind } from '../src/constants/enums';

// dest = 'personal' or a group id. Group rows are split in the editor (step 2).
type RowEdit = { kind: TxnKind; category: string; amount: string; dest: string };
type Step = 'classify' | 'split';

export default function ReviewScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useDataRefresh();
  const [edits, setEdits] = useState<Record<string, Partial<RowEdit>>>({});
  const [step, setStep] = useState<Step>('classify');
  const [catPickerFor, setCatPickerFor] = useState<string | null>(null);
  const [destSheetFor, setDestSheetFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, loading, error, reload } = useScreenData(async (db) => {
    const me = await getMe(db);
    const groups = await getAllGroups(db);
    const personalId = groups.find(g => g.is_personal === 1)?.id ?? groups[0]?.id ?? '';
    const [pending, expenseCats, incomeCats] = await Promise.all([
      getPending(db),
      getCategories(db, 'expense'),
      getCategories(db, 'income'),
    ]);
    return {
      pending, meId: me?.id ?? '', personalId,
      sharedGroups: groups.filter(g => g.is_personal !== 1).map(g => ({ id: g.id, name: g.name })),
      expenseCats, incomeCats,
    };
  }, []);

  const pending = data?.pending ?? [];
  const hasGroups = (data?.sharedGroups.length ?? 0) > 0;

  function eff(row: PendingTxn): RowEdit {
    const e = edits[row.id] ?? {};
    return {
      kind: e.kind ?? (row.kind === 'settlement' ? 'expense' : row.kind),
      category: e.category ?? row.category ?? '',
      amount: e.amount ?? String(row.amount / 100),
      dest: e.dest ?? 'personal',
    };
  }
  const patch = (id: string, p: Partial<RowEdit>) => setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...p } }));
  const setAllDest = (dest: string) => {
    haptic.selection();
    setEdits(prev => {
      const next = { ...prev };
      for (const row of pending) next[row.id] = { ...next[row.id], dest };
      return next;
    });
  };

  const groupRows = pending.filter(r => eff(r).dest !== 'personal');
  const personalRows = pending.filter(r => eff(r).dest === 'personal');

  /** Insert every Personal row at once, then move to group-split (or finish). */
  async function confirmPersonalAndContinue() {
    if (saving || !data?.personalId || !data?.meId) return;
    const hadGroups = groupRows.length > 0;
    setSaving(true);
    try {
      for (const row of personalRows) {
        const v = eff(row);
        const amount = parseToPaise(v.amount);
        if (amount <= 0) continue;
        await insertTxn(db, {
          groupId: data.personalId, kind: v.kind, entryMode: 'quick', date: row.date,
          category: v.category || (v.kind === 'income' ? 'Other Income' : 'Other'),
          note: row.description,
          payments: [{ personId: data.meId, amount }],
          shares: [{ personId: data.meId, amount }],
        });
        await deletePending(db, row.id);
      }
      haptic.success();
      refresh();
      reload();
      if (hadGroups) setStep('split');
      else router.back();
    } finally {
      setSaving(false);
    }
  }

  async function discardRow(row: PendingTxn) {
    await deletePending(db, row.id);
    haptic.warning();
    refresh();
    reload();
  }

  /** Hand a group row to the editor to split (Equal/Specific/Percent/Shares), carrying its category. */
  async function splitInEditor(row: PendingTxn) {
    const v = eff(row);
    const cat = v.category ? `&category=${encodeURIComponent(v.category)}` : '';
    await deletePending(db, row.id);
    refresh();
    router.push(`/add/quick?kind=${v.kind === 'income' ? 'income' : 'expense'}&groupId=${v.dest}&amount=${row.amount}&note=${encodeURIComponent(row.description)}&date=${row.date}${cat}` as any);
  }

  async function handleClearAll() {
    await clearPending(db);
    haptic.warning();
    refresh();
    reload();
  }

  // ---- row renderers -------------------------------------------------------
  function ClassifyRow({ row }: { row: PendingTxn }) {
    const v = eff(row);
    const vis = categoryVisual(v.category);
    const destName = v.dest === 'personal' ? 'Personal' : (data?.sharedGroups.find(g => g.id === v.dest)?.name ?? 'Group');
    return (
      <View style={styles.card}>
        <View style={styles.rowTop}>
          <Text style={styles.desc} numberOfLines={1}>{row.description}</Text>
          <Text style={styles.date}>{format(row.date, 'd MMM')}</Text>
        </View>
        <View style={styles.controls}>
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
                <Text style={[styles.kindText, v.kind === k && styles.kindTextOn]}>{k === 'income' ? 'Inc' : 'Exp'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.discardBtn} onPress={() => discardRow(row)} accessibilityRole="button" accessibilityLabel="Discard">
            <Feather name="trash-2" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <View style={styles.controls}>
          <TouchableOpacity style={styles.pill} onPress={() => setCatPickerFor(row.id)} accessibilityRole="button" accessibilityLabel="Category">
            <View style={[styles.pillDot, { backgroundColor: (vis.color ?? colors.accent) + '22' }]}>
              <Feather name={asFeather(vis.icon, 'tag')} size={12} color={vis.color ?? colors.accent} />
            </View>
            <Text style={styles.pillText} numberOfLines={1}>{v.category || 'Category'}</Text>
            <Feather name="chevron-down" size={12} color={colors.textMuted} />
          </TouchableOpacity>
          {hasGroups && (
            <TouchableOpacity style={[styles.pill, v.dest !== 'personal' && styles.pillGroup]} onPress={() => setDestSheetFor(row.id)} accessibilityRole="button" accessibilityLabel="Personal or group">
              <Feather name={v.dest === 'personal' ? 'user' : 'users'} size={12} color={v.dest === 'personal' ? colors.textSecondary : colors.settle} />
              <Text style={[styles.pillText, v.dest !== 'personal' && { color: colors.settle }]} numberOfLines={1}>{destName}</Text>
              <Feather name="chevron-down" size={12} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  function SplitRow({ row }: { row: PendingTxn }) {
    const v = eff(row);
    const groupName = data?.sharedGroups.find(g => g.id === v.dest)?.name ?? 'group';
    return (
      <View style={styles.card}>
        <View style={styles.rowTop}>
          <Text style={styles.desc} numberOfLines={1}>{row.description}</Text>
          <Text style={styles.amtStatic}>{formatRupees(row.amount)}</Text>
        </View>
        <View style={styles.controls}>
          <Text style={styles.splitMeta} numberOfLines={1}>{v.category || 'Uncategorized'} · {groupName}</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={styles.discardBtn} onPress={() => discardRow(row)} accessibilityRole="button" accessibilityLabel="Discard">
            <Feather name="trash-2" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.splitBtn} onPress={() => splitInEditor(row)} accessibilityRole="button" accessibilityLabel={`Split in ${groupName}`}>
            <Feather name="users" size={14} color={colors.bg} />
            <Text style={styles.splitBtnText}>Split</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const catPickerRow = catPickerFor ? pending.find(r => r.id === catPickerFor) ?? null : null;
  const catPickerKind = catPickerRow ? eff(catPickerRow).kind : 'expense';
  const catList: Category[] = catPickerKind === 'income' ? (data?.incomeCats ?? []) : (data?.expenseCats ?? []);
  const catValue = catPickerRow ? (catList.find(c => c.name === eff(catPickerRow).category) ?? null) : null;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={step === 'classify' ? 'Review' : 'Split group items'}
        onBack={() => (step === 'split' ? setStep('classify') : router.back())}
        right={pending.length > 0 && step === 'classify' ? (
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
          body="Import a Google Pay or bank statement (Settings → Import) and the transactions show up here to confirm."
          actionLabel="Import transactions"
          onAction={() => router.push('/import' as any)}
        />
      ) : step === 'classify' ? (
        <FlatList
          data={pending}
          keyExtractor={r => r.id}
          renderItem={({ item }) => <ClassifyRow row={item} />}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 96 }]}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          windowSize={8}
          removeClippedSubviews
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <Text style={styles.stepLabel}>Step 1 of {hasGroups ? 2 : 1} · Classify</Text>
              <Text style={styles.intro}>{pending.length} transactions. Set type, category and where each belongs.</Text>
              {hasGroups && (
                <View style={styles.assignAll}>
                  <Text style={styles.assignAllLabel}>All to:</Text>
                  <TouchableOpacity style={styles.assignChip} onPress={() => setAllDest('personal')}><Text style={styles.assignChipText}>Personal</Text></TouchableOpacity>
                  {data!.sharedGroups.slice(0, 3).map(g => (
                    <TouchableOpacity key={g.id} style={styles.assignChip} onPress={() => setAllDest(g.id)}><Text style={styles.assignChipText} numberOfLines={1}>{g.name}</Text></TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          }
        />
      ) : (
        <FlatList
          data={groupRows}
          keyExtractor={r => r.id}
          renderItem={({ item }) => <SplitRow row={item} />}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 96 }]}
          initialNumToRender={12}
          windowSize={8}
          removeClippedSubviews
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <Text style={styles.stepLabel}>Step 2 of 2 · Split groups</Text>
              <Text style={styles.intro}>Tap Split to assign members and a split type for each shared transaction.</Text>
            </View>
          }
          ListEmptyComponent={
            <EmptyState icon="check-circle" title="All done" body="Every group transaction has been handled." actionLabel="Finish" onAction={() => router.back()} />
          }
        />
      )}

      {/* Sticky footer — step 1 primary action. */}
      {!loading && pending.length > 0 && step === 'classify' && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
          <TouchableOpacity style={[styles.primaryBtn, saving && { opacity: 0.6 }]} onPress={confirmPersonalAndContinue} disabled={saving} accessibilityRole="button">
            <Text style={styles.primaryBtnText}>
              {groupRows.length > 0
                ? `Confirm ${personalRows.length} personal · split ${groupRows.length} group`
                : `Confirm ${personalRows.length} transaction${personalRows.length === 1 ? '' : 's'}`}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Shared category picker (mounted once). */}
      {catPickerRow && (
        <CategoryPicker
          categories={catList}
          value={catValue}
          forceOpen
          hideTrigger
          onClose={() => setCatPickerFor(null)}
          onChange={(c) => { patch(catPickerRow.id, { category: c.name }); setCatPickerFor(null); }}
        />
      )}

      {/* Shared destination sheet (mounted once). */}
      <SheetModal visible={destSheetFor !== null} onClose={() => setDestSheetFor(null)} title="Personal or group" scroll={false}>
        {destSheetFor && (
          <>
            <DestOption label="Personal" icon="user" active={eff(pending.find(r => r.id === destSheetFor)!).dest === 'personal'} onPress={() => { patch(destSheetFor, { dest: 'personal' }); setDestSheetFor(null); }} />
            {data?.sharedGroups.map(g => (
              <DestOption key={g.id} label={g.name} icon="users" active={eff(pending.find(r => r.id === destSheetFor)!).dest === g.id} onPress={() => { patch(destSheetFor, { dest: g.id }); setDestSheetFor(null); }} />
            ))}
          </>
        )}
      </SheetModal>
    </View>
  );
}

function DestOption({ label, icon, active, onPress }: { label: string; icon: 'user' | 'users'; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.destOption, active && styles.destOptionOn]} onPress={onPress} accessibilityRole="button">
      <Feather name={icon} size={16} color={active ? colors.settle : colors.textSecondary} />
      <Text style={[styles.destOptionText, active && { color: colors.settle, fontFamily: 'Inter_600SemiBold' }]}>{label}</Text>
      {active && <Feather name="check" size={16} color={colors.settle} style={{ marginLeft: 'auto' }} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.sm },
  headerBlock: { gap: space.xs, marginBottom: space.xs },
  stepLabel: { ...type.caption, color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Inter_600SemiBold' },
  intro: { ...type.label, color: colors.textMuted },
  clearAll: { ...type.label, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
  assignAll: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: space.xs },
  assignAllLabel: { ...type.caption, color: colors.textMuted },
  assignChip: { paddingHorizontal: space.sm + 2, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: colors.border, maxWidth: 120 },
  assignChipText: { ...type.caption, color: colors.textSecondary },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm, ...shadow.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  desc: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', flex: 1 },
  date: { ...type.caption, color: colors.textMuted },
  amtStatic: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, color: colors.textPrimary },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  amtWrap: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.sm, flex: 1 },
  rupee: { ...type.body, color: colors.textMuted },
  amtInput: { flex: 1, ...type.body, color: colors.textPrimary, fontFamily: 'SpaceMono_400Regular', paddingVertical: 8 },
  kindToggle: { flexDirection: 'row', backgroundColor: colors.bgMuted, borderRadius: radius.md, padding: 2 },
  kindBtn: { paddingHorizontal: space.sm, paddingVertical: 6, borderRadius: radius.sm },
  kindExpense: { backgroundColor: colors.expense },
  kindIncome: { backgroundColor: colors.income },
  kindText: { ...type.label, color: colors.textSecondary },
  kindTextOn: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  pill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgMuted, borderRadius: radius.pill, paddingHorizontal: space.sm + 2, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
  pillGroup: { borderColor: colors.settle + '55' },
  pillDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pillText: { ...type.label, color: colors.textSecondary, flex: 1 },
  discardBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgMuted },
  splitMeta: { ...type.label, color: colors.textSecondary, flexShrink: 1 },
  splitBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.md, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.settle },
  splitBtnText: { ...type.label, color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: layout.screenPaddingH, paddingTop: space.sm, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  primaryBtn: { height: 50, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { ...type.button, color: colors.bg },
  destOption: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: radius.md },
  destOptionOn: { backgroundColor: colors.bgMuted },
  destOptionText: { ...type.body, color: colors.textPrimary },
});
