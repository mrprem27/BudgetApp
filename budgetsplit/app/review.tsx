import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert, ScrollView } from 'react-native';
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
import { DatePickerSheet } from '../src/components/ui/DatePickerSheet';
import { TimePickerSheet, type TimeValue } from '../src/components/ui/TimePickerSheet';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { SkeletonCard } from '../src/components/ui/Skeleton';
import { SettingsRow, settingsRowDivider } from '../src/components/ui/SettingsRow';
import { CategoryPicker } from '../src/components/finance/CategoryPicker';
import { SplitEditor } from '../src/components/finance/add/SplitEditor';
import {
  getPending, deletePending, clearPending, updatePendingDraft, restorePending,
  type PendingTxn, type PendingDraft,
} from '../src/db/queries/pending';
import { insertTxn, softDeleteTxn } from '../src/db/queries/transactions';
import { getMe, getGroupMembers, type Person } from '../src/db/queries/persons';
import { getAllGroups } from '../src/db/queries/groups';
import { getCategories, type Category } from '../src/db/queries/categories';
import { parseToPaise, formatRupees, splitByMode } from '../src/lib/money';
import { recordCorrection } from '../src/lib/smartCategoryLearn';
import {
  type AmountMode, type ReviewFilters, DEFAULT_FILTERS,
  filtersActive, parseFilterDate, rowMatches, isSimilarMerchant,
} from '../src/lib/reviewFilter';
import { type SavedView, loadViews, upsertView, deleteView, makeViewId } from '../src/lib/reviewViews';
import { useScreenData } from '../src/hooks/useScreenData';
import { useDataRefresh } from '../src/components/system/DataRefreshProvider';
import { useUndo } from '../src/components/system/UndoToast';
import { haptic } from '../src/lib/haptics';
import type { TxnKind, SplitMode } from '../src/constants/enums';

// One screen: every pending row is fully editable in place. dest = 'personal' or a
// group id; picking a group reveals the inline split. Edits auto-save (draft) to
// pending_txn; only Confirm/Save commits a row into a real transaction.
type RowEdit = { kind: TxnKind; category: string; amount: string; dest: string };
type SplitState = { included: string[]; mode: SplitMode; values: Record<string, string> };

// A committable row resolved to its insert shape, or the reason it isn't ready.
type CommitPlan =
  | { ok: true; groupId: string; kind: TxnKind; payer: string; shares: { personId: string; amount: number }[]; total: number; category: string; snap: PendingTxn; destName: string }
  | { ok: false };

const BATCH = '__batch__';

export default function ReviewScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useDataRefresh();
  const { showUndo } = useUndo();
  const [edits, setEdits] = useState<Record<string, Partial<RowEdit>>>({});
  const [splits, setSplits] = useState<Record<string, SplitState>>({});
  const [catPickerFor, setCatPickerFor] = useState<string | null>(null);
  const [destSheetFor, setDestSheetFor] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  // Selection mode (bulk actions).
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkGroupSheet, setBulkGroupSheet] = useState(false);
  // Focus workspace: an ephemeral subset + filters, all in-Review, no DB group.
  const [focusIds, setFocusIds] = useState<Set<string> | null>(null);
  const [filters, setFilters] = useState<ReviewFilters>(DEFAULT_FILTERS);
  const [filterSheet, setFilterSheet] = useState(false);
  // Overflow menu + saved views (persisted focus + payer).
  const [menuOpen, setMenuOpen] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeView, setActiveView] = useState<SavedView | null>(null);
  const [viewsSheet, setViewsSheet] = useState(false);
  const [saveViewSheet, setSaveViewSheet] = useState(false);

  useEffect(() => { loadViews().then(setSavedViews).catch(() => {}); }, []);

  const { data, loading, error, reload } = useScreenData(async (db) => {
    const me = await getMe(db);
    const groups = await getAllGroups(db);
    const personalId = groups.find(g => g.is_personal === 1)?.id ?? groups[0]?.id ?? '';
    // A pending row can only be assigned to an active shared group.
    const shared = groups.filter(g => g.is_personal !== 1 && g.is_archived !== 1);
    const [pending, expenseCats, incomeCats, ...memberLists] = await Promise.all([
      getPending(db),
      getCategories(db, 'expense'),
      getCategories(db, 'income'),
      ...shared.map(g => getGroupMembers(db, g.id)),
    ]);
    const groupMembers: Record<string, Person[]> = {};
    shared.forEach((g, i) => { groupMembers[g.id] = memberLists[i] as Person[]; });
    return {
      pending, meId: me?.id ?? '', personalId,
      sharedGroups: shared.map(g => ({ id: g.id, name: g.name })),
      groupMembers, expenseCats, incomeCats,
    };
  }, []);

  const pending = data?.pending ?? [];
  const hasGroups = (data?.sharedGroups.length ?? 0) > 0;
  const batchSaving = savingId === BATCH;

  /** Effective values for a row = local edits over the persisted draft columns. */
  function eff(row: PendingTxn): RowEdit {
    const e = edits[row.id] ?? {};
    const kind = e.kind ?? (row.kind === 'settlement' ? 'expense' : row.kind);
    const persistedDest = row.dest_group_id ?? 'personal';
    return {
      kind,
      category: e.category ?? row.category ?? '',
      amount: e.amount ?? String(row.amount / 100),
      // Income is always personal (matches Quick) — you don't split income into a group.
      dest: kind === 'income' ? 'personal' : (e.dest ?? persistedDest),
    };
  }

  /** Normalize a pending row to the filter engine's shape (uses effective edits). */
  function filterRow(row: PendingTxn) {
    const v = eff(row);
    return { description: row.description, category: v.category, amountPaise: parseToPaise(v.amount), date: row.date };
  }

  const focusActive = focusIds !== null;
  const hasFilters = filtersActive(filters);
  const baseRows = focusActive ? pending.filter(r => focusIds!.has(r.id)) : pending;
  const visibleRows = hasFilters ? baseRows.filter(r => rowMatches(filterRow(r), filters)) : baseRows;
  const narrowed = focusActive || hasFilters;
  // Distinct categories present in the working set → category filter chips.
  const distinctCats = Array.from(new Set(baseRows.map(r => eff(r).category).filter(Boolean)));

  /** Apply an edit locally (instant UI) and auto-save the matching draft columns. */
  function patch(id: string, p: Partial<RowEdit>) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...p } }));
    const draft: PendingDraft = {};
    if (p.kind !== undefined) draft.kind = p.kind;
    if (p.category !== undefined) draft.category = p.category;
    if (p.dest !== undefined) draft.dest_group_id = p.dest === 'personal' ? null : p.dest;
    // amount is flushed on blur (below), not on every keystroke.
    if (Object.keys(draft).length) updatePendingDraft(db, id, draft).catch(() => {});
  }
  const patchAmountLocal = (id: string, amount: string) =>
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], amount } }));
  const flushAmount = (id: string, amount: string) =>
    updatePendingDraft(db, id, { amount: parseToPaise(amount) }).catch(() => {});

  const setDestMany = (ids: string[], dest: string) => {
    setEdits(prev => {
      const next = { ...prev };
      for (const id of ids) next[id] = { ...next[id], dest };
      return next;
    });
    const gid = dest === 'personal' ? null : dest;
    for (const id of ids) updatePendingDraft(db, id, { dest_group_id: gid }).catch(() => {});
  };
  const setAllDest = (dest: string) => { haptic.selection(); setDestMany(visibleRows.map(r => r.id), dest); };

  /** Effective split state = local edits over the persisted split_draft. */
  function splitState(row: PendingTxn): SplitState {
    const s = splits[row.id];
    if (s) return s;
    const members = data?.groupMembers[eff(row).dest] ?? [];
    if (row.split_draft) {
      try {
        const d = JSON.parse(row.split_draft) as Partial<SplitState>;
        return {
          included: d.included ?? members.map(m => m.id),
          mode: d.mode ?? 'equal',
          values: d.values ?? {},
        };
      } catch { /* fall through to defaults */ }
    }
    return { included: members.map(m => m.id), mode: 'equal', values: {} };
  }
  function patchSplit(row: PendingTxn, p: Partial<SplitState>) {
    const next = { ...splitState(row), ...p };
    setSplits(prev => ({ ...prev, [row.id]: next }));
    updatePendingDraft(db, row.id, { split_draft: JSON.stringify(next) }).catch(() => {});
  }

  /**
   * Set a row's category, remember the merchant→category preference (feeds the
   * shared learner used by Add-expense), and — if other pending rows look like
   * the same merchant — offer to apply the category to them too. Never silent.
   */
  function applyCategory(row: PendingTxn, category: string) {
    patch(row.id, { category });
    // Remember for next time (same learner Add-expense auto-suggests from).
    recordCorrection(row.description, category).catch(() => {});
    const kind = eff(row).kind;
    const similar = pending.filter(r =>
      r.id !== row.id
      && eff(r).kind === kind
      && eff(r).category !== category
      && isSimilarMerchant(row.description, r.description),
    );
    if (similar.length === 0) return;
    Alert.alert(
      'Apply to similar?',
      `${similar.length} other row${similar.length === 1 ? '' : 's'} look like “${row.description}”. Set ${similar.length === 1 ? 'it' : 'them'} to ${category} too?`,
      [
        { text: 'Just this one', style: 'cancel' },
        { text: `Apply to ${similar.length}`, onPress: () => { for (const r of similar) patch(r.id, { category }); haptic.success(); } },
      ],
    );
  }

  /** Snapshot the row's CURRENT effective state so Undo restores exactly that. */
  function snapshot(row: PendingTxn): PendingTxn {
    const v = eff(row);
    const isGroup = v.dest !== 'personal';
    return {
      ...row,
      kind: v.kind,
      category: v.category || null,
      amount: parseToPaise(v.amount),
      dest_group_id: isGroup ? v.dest : null,
      split_draft: isGroup ? JSON.stringify(splitState(row)) : null,
    };
  }

  // ---- commit path (shared by per-row Confirm and batch Save) --------------

  /** Who paid a group row: the active view's payer if they're a member of that
   *  group, otherwise me. Personal rows are always me. */
  function payerFor(groupId: string): string {
    const p = activeView?.paidBy;
    if (p && (data?.groupMembers[groupId] ?? []).some(m => m.id === p)) return p;
    return data!.meId;
  }

  /** Resolve a row to its insert shape, or mark it not-ready. Pure (no writes). */
  function planCommit(row: PendingTxn): CommitPlan {
    if (!data?.personalId || !data?.meId) return { ok: false };
    const v = eff(row);
    const total = parseToPaise(v.amount);
    if (total <= 0) return { ok: false };
    const category = v.category || (v.kind === 'income' ? 'Other Income' : 'Other');
    if (v.dest !== 'personal') {
      const st = splitState(row);
      const split = splitByMode(total, st.included, st.mode, st.values);
      const assigned = st.included.reduce((s, id) => s + (split[id] ?? 0), 0);
      if (st.included.length === 0 || assigned !== total) return { ok: false };
      return {
        ok: true, groupId: v.dest, kind: 'expense', payer: payerFor(v.dest), total, category, snap: snapshot(row),
        shares: st.included.map(id => ({ personId: id, amount: split[id] ?? 0 })),
        destName: data.sharedGroups.find(g => g.id === v.dest)?.name ?? 'group',
      };
    }
    return {
      ok: true, groupId: data.personalId, kind: v.kind, payer: data.meId, total, category, snap: snapshot(row),
      // Income has no shares (canonical shape, matches Quick); expense = my full share.
      shares: v.kind === 'income' ? [] : [{ personId: data.meId, amount: total }],
      destName: 'Personal',
    };
  }

  /** Insert a planned row and drop it from the inbox. Returns undo material. */
  async function insertCommit(row: PendingTxn, plan: Extract<CommitPlan, { ok: true }>): Promise<{ txnId: string; snap: PendingTxn }> {
    const txnId = await insertTxn(db, {
      groupId: plan.groupId, kind: plan.kind, entryMode: 'quick', date: row.date,
      category: plan.category, note: row.description,
      payments: [{ personId: plan.payer, amount: plan.total }],
      shares: plan.shares,
    });
    await deletePending(db, row.id);
    return { txnId, snap: plan.snap };
  }

  /** Commit one row, with Undo. */
  async function confirmRow(row: PendingTxn) {
    if (savingId) return;
    const plan = planCommit(row);
    if (!plan.ok) {
      const v = eff(row);
      Alert.alert(
        parseToPaise(v.amount) <= 0 ? 'Add an amount' : 'Balance the split',
        parseToPaise(v.amount) <= 0
          ? 'This row needs an amount above zero before it can be saved.'
          : 'Assign the full amount to the people sharing this before saving.',
      );
      return;
    }
    setSavingId(row.id);
    try {
      const done = await insertCommit(row, plan);
      haptic.success();
      refresh();
      reload();
      showUndo({
        message: `Saved to ${plan.destName}`,
        onUndo: async () => { await softDeleteTxn(db, done.txnId); await restorePending(db, done.snap); refresh(); reload(); },
      });
    } finally {
      setSavingId(null);
    }
  }

  /** Commit many rows at once (Save all / Save selected), with a batch Undo. */
  function saveMany(rows: PendingTxn[], label: string) {
    if (savingId) return;
    const ready = rows.map(r => ({ row: r, plan: planCommit(r) })).filter((x): x is { row: PendingTxn; plan: Extract<CommitPlan, { ok: true }> } => x.plan.ok);
    const skipped = rows.length - ready.length;
    if (ready.length === 0) {
      Alert.alert('Nothing ready to save', 'These rows still need an amount — and a balanced split for group expenses.');
      return;
    }
    Alert.alert(
      label,
      `${ready.length} transaction${ready.length === 1 ? '' : 's'} will be saved${skipped > 0 ? `. ${skipped} skipped — they need an amount or a balanced split.` : '.'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save', onPress: async () => {
            setSavingId(BATCH);
            const done: { txnId: string; snap: PendingTxn }[] = [];
            try { for (const { row, plan } of ready) done.push(await insertCommit(row, plan)); }
            finally { setSavingId(null); }
            haptic.success();
            exitSelect();
            refresh();
            reload();
            showUndo({
              message: `Saved ${done.length} transaction${done.length === 1 ? '' : 's'}`,
              onUndo: async () => { for (const d of done) { await softDeleteTxn(db, d.txnId); await restorePending(db, d.snap); } refresh(); reload(); },
            });
          },
        },
      ],
    );
  }

  /** Remove a row from the inbox (not saved anywhere), with Undo. */
  async function deleteRow(row: PendingTxn) {
    const snap = snapshot(row);
    await deletePending(db, row.id);
    haptic.warning();
    refresh();
    reload();
    showUndo({
      message: 'Removed from review',
      onUndo: async () => { await restorePending(db, snap); refresh(); reload(); },
    });
  }

  function handleClearAll() {
    Alert.alert(
      'Clear all reviews?',
      `This removes all ${pending.length} pending transaction${pending.length === 1 ? '' : 's'} from Review. Nothing is saved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all', style: 'destructive',
          onPress: async () => {
            const snap = await getPending(db); // capture latest drafts for Undo
            await clearPending(db);
            haptic.warning();
            refresh();
            reload();
            showUndo({
              message: `Cleared ${snap.length} transaction${snap.length === 1 ? '' : 's'}`,
              onUndo: async () => { for (const r of snap) await restorePending(db, r); refresh(); reload(); },
            });
          },
        },
      ],
    );
  }

  // ---- selection & focus ---------------------------------------------------
  function exitSelect() { setSelectMode(false); setSelected(new Set()); }
  function toggleSelect(id: string) {
    haptic.selection();
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every(r => selected.has(r.id));
  function toggleSelectAll() {
    haptic.selection();
    setSelected(allVisibleSelected ? new Set() : new Set(visibleRows.map(r => r.id)));
  }
  function assignBulkGroup(dest: string) {
    const ids = [...selected];
    const name = data?.sharedGroups.find(g => g.id === dest)?.name ?? 'group';
    setBulkGroupSheet(false);
    Alert.alert('Assign group?', `Move ${ids.length} transaction${ids.length === 1 ? '' : 's'} to ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Assign', onPress: () => { setDestMany(ids, dest); haptic.success(); } },
    ]);
  }
  /** Pull the selected rows into a focused, clutter-free view (in-Review only). */
  function focusSelected() {
    if (selected.size === 0) return;
    setFocusIds(new Set(selected));
    exitSelect();
    haptic.selection();
  }
  function exitFocus() { setFocusIds(null); setFilters(DEFAULT_FILTERS); setActiveView(null); }

  /** Apply a saved view: its filter, bulk-assign its rows to its group, and mark
   *  its payer active (so commits use that person). */
  function applyView(view: SavedView) {
    setActiveView(view);
    setFilters(view.filters);
    setFocusIds(null);
    setViewsSheet(false);
    setMenuOpen(false);
    if (view.groupId) {
      const inView = filtersActive(view.filters) ? pending.filter(r => rowMatches(filterRow(r), view.filters)) : pending;
      // Only expense rows can belong to a group (income is always personal).
      setDestMany(inView.filter(r => eff(r).kind === 'expense').map(r => r.id), view.groupId);
    }
    haptic.selection();
  }

  /** Persist the current filter (+ chosen group/payer) as a named view. */
  async function saveView(name: string, groupId: string | null, paidBy: string | null) {
    const view: SavedView = { id: makeViewId(), name: name.trim() || 'Saved view', filters, groupId, paidBy };
    setSavedViews(await upsertView(view));
    setActiveView(view);
    setSaveViewSheet(false);
    haptic.success();
  }
  async function removeView(id: string) {
    setSavedViews(await deleteView(id));
    if (activeView?.id === id) setActiveView(null);
  }

  // ---- row renderer --------------------------------------------------------
  function RowCard({ row }: { row: PendingTxn }) {
    const v = eff(row);
    const vis = categoryVisual(v.category);
    const isGroup = v.dest !== 'personal';
    const groupName = isGroup ? (data?.sharedGroups.find(g => g.id === v.dest)?.name ?? 'Group') : 'Personal';
    const gm = isGroup ? (data?.groupMembers[v.dest] ?? []) : [];
    const total = parseToPaise(v.amount);
    const st = splitState(row);
    const shares = isGroup ? splitByMode(total, st.included, st.mode, st.values) : {};
    const assigned = isGroup ? st.included.reduce((s, id) => s + (shares[id] ?? 0), 0) : total;
    const balanced = !isGroup || (st.included.length > 0 && assigned === total);
    const saving = savingId === row.id;
    const checked = selected.has(row.id);

    return (
      <View style={[styles.card, selectMode && checked && styles.cardChecked]}>
        <View style={styles.rowTop}>
          {selectMode && (
            <TouchableOpacity onPress={() => toggleSelect(row.id)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked }} style={styles.checkbox}>
              <Feather name={checked ? 'check-circle' : 'circle'} size={20} color={checked ? colors.accent : colors.textMuted} />
            </TouchableOpacity>
          )}
          <Text style={styles.desc} numberOfLines={1}>{row.description}</Text>
          <Text style={styles.date}>{format(row.date, 'd MMM · h:mm a')}</Text>
        </View>

        <View style={styles.controls}>
          <View style={styles.amtWrap}>
            <Text style={styles.rupee}>₹</Text>
            <TextInput
              style={styles.amtInput}
              value={v.amount}
              onChangeText={(t) => patchAmountLocal(row.id, t.replace(/[^0-9.]/g, ''))}
              onEndEditing={(e) => flushAmount(row.id, e.nativeEvent.text)}
              keyboardType="decimal-pad"
              accessibilityLabel="Amount"
            />
          </View>
          <View style={styles.kindToggle}>
            {(['expense', 'income'] as TxnKind[]).map(k => (
              <TouchableOpacity
                key={k}
                style={[styles.kindBtn, v.kind === k && (k === 'income' ? styles.kindIncome : styles.kindExpense)]}
                onPress={() => { haptic.selection(); patch(row.id, k === 'income' ? { kind: k, category: '', dest: 'personal' } : { kind: k, category: '' }); }}
                accessibilityRole="button"
                accessibilityState={{ selected: v.kind === k }}
              >
                <Text style={[styles.kindText, v.kind === k && styles.kindTextOn]}>{k === 'income' ? 'Inc' : 'Exp'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.discardBtn} onPress={() => deleteRow(row)} accessibilityRole="button" accessibilityLabel="Remove">
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
          {hasGroups && v.kind === 'expense' && (
            <TouchableOpacity style={[styles.pill, isGroup && styles.pillGroup]} onPress={() => setDestSheetFor(row.id)} accessibilityRole="button" accessibilityLabel="Personal or group">
              <Feather name={isGroup ? 'users' : 'user'} size={12} color={isGroup ? colors.settle : colors.textSecondary} />
              <Text style={[styles.pillText, isGroup && { color: colors.settle }]} numberOfLines={1}>{groupName}</Text>
              <Feather name="chevron-down" size={12} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Inline split — shown only when a group is selected. */}
        {isGroup && (
          <View style={{ gap: space.sm }}>
            <SplitEditor
              members={gm}
              included={st.included}
              onToggle={(id) => patchSplit(row, { included: st.included.includes(id) ? st.included.filter(x => x !== id) : [...st.included, id] })}
              mode={st.mode}
              onMode={(m) => patchSplit(row, { mode: m })}
              rawValue={(id) => st.values[id] ?? ''}
              onValue={(id, val) => patchSplit(row, { values: { ...st.values, [id]: val } })}
              result={(id) => shares[id] ?? 0}
            />
            <Text style={[styles.splitMeta, { color: balanced ? colors.income : colors.expense, textAlign: 'right' }]}>
              {st.included.length === 0 ? 'Pick who shares this'
                : assigned === total ? 'Balanced'
                : assigned < total ? `${formatRupees(total - assigned)} unassigned`
                : `${formatRupees(assigned - total)} over`}
            </Text>
          </View>
        )}

        {/* Per-row Confirm — hidden in selection mode (batch Save is the action there). */}
        {!selectMode && (
          <View style={styles.controls}>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              style={[styles.confirmBtn, (!balanced || saving || batchSaving) && { opacity: 0.5 }]}
              onPress={() => confirmRow(row)}
              disabled={!balanced || saving || batchSaving}
              accessibilityRole="button"
              accessibilityLabel="Save this transaction"
            >
              <Feather name="check" size={14} color={colors.bg} />
              <Text style={styles.confirmBtnText}>{saving ? 'Saving…' : 'Confirm'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  const catPickerRow = catPickerFor ? pending.find(r => r.id === catPickerFor) ?? null : null;
  const catPickerKind = catPickerRow ? eff(catPickerRow).kind : 'expense';
  const catList: Category[] = catPickerKind === 'income' ? (data?.incomeCats ?? []) : (data?.expenseCats ?? []);
  const catValue = catPickerRow ? (catList.find(c => c.name === eff(catPickerRow).category) ?? null) : null;

  const headerRight = pending.length > 0 ? (
    selectMode ? (
      <TouchableOpacity onPress={exitSelect} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel selection">
        <Text style={styles.headerAction}>Cancel</Text>
      </TouchableOpacity>
    ) : (
      <TouchableOpacity onPress={() => setMenuOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="More options">
        <Feather name="more-horizontal" size={22} color={colors.textPrimary} />
      </TouchableOpacity>
    )
  ) : undefined;

  const activePayerName = activeView?.paidBy ? (data?.groupMembers[activeView.groupId ?? '']?.find(m => m.id === activeView.paidBy)?.name ?? null) : null;

  const emptyFiltered = pending.length > 0 && visibleRows.length === 0;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Review" onBack={() => router.back()} right={headerRight} />

      {/* Focus / filter / view banner — the working set. */}
      {!loading && (narrowed || activeView) && pending.length > 0 && (
        <View style={styles.banner}>
          <Feather name={activeView ? 'bookmark' : focusActive ? 'crosshair' : 'filter'} size={14} color={colors.accent} />
          <Text style={styles.bannerText} numberOfLines={1}>
            {activeView ? activeView.name : focusActive ? 'Focus' : 'Filtered'}
            {' · '}{visibleRows.length} of {pending.length}
            {activePayerName ? ` · paid by ${activePayerName}` : ''}
          </Text>
          <TouchableOpacity onPress={exitFocus} hitSlop={8} accessibilityRole="button">
            <Text style={styles.bannerReset}>Show all</Text>
          </TouchableOpacity>
        </View>
      )}

      {error ? (
        <ErrorState onRetry={reload} />
      ) : loading ? (
        <View style={[styles.scroll, { paddingTop: space.sm }]}>
          {[0, 1, 2, 3].map(i => <SkeletonCard key={i} height={150} style={{ marginBottom: space.sm }} />)}
        </View>
      ) : pending.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="Nothing to review"
          body="Import a Google Pay or bank statement (Settings → Import) and the transactions show up here to confirm."
          actionLabel="Import transactions"
          onAction={() => router.push('/import' as any)}
        />
      ) : emptyFiltered ? (
        <EmptyState
          icon="search"
          title="No matches"
          body="No transactions match the current filter or focus. Adjust the filter, or show all."
          actionLabel="Show all"
          onAction={exitFocus}
        />
      ) : (
        <FlatList
          data={visibleRows}
          keyExtractor={r => r.id}
          renderItem={({ item }) => <RowCard row={item} />}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 96 }]}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          windowSize={8}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              {selectMode ? (
                <View style={styles.selectHeader}>
                  <Text style={styles.stepLabel}>{selected.size} selected</Text>
                  <TouchableOpacity onPress={toggleSelectAll} hitSlop={6} accessibilityRole="button">
                    <Text style={styles.selectAll}>{allVisibleSelected ? 'Clear' : 'Select all'}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={styles.stepLabel}>To review</Text>
                  <Text style={styles.intro}>{visibleRows.length} transaction{visibleRows.length === 1 ? '' : 's'}. Set each one, then Confirm to save. Changes are kept as you go.</Text>
                  {hasGroups && (
                    <View style={styles.assignAll}>
                      <Text style={styles.assignAllLabel}>All to:</Text>
                      <TouchableOpacity style={styles.assignChip} onPress={() => setAllDest('personal')}><Text style={styles.assignChipText}>Personal</Text></TouchableOpacity>
                      {data!.sharedGroups.slice(0, 3).map(g => (
                        <TouchableOpacity key={g.id} style={styles.assignChip} onPress={() => setAllDest(g.id)}><Text style={styles.assignChipText} numberOfLines={1}>{g.name}</Text></TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>
          }
        />
      )}

      {/* Sticky footer — Save all (normal) or bulk actions (selection). */}
      {!loading && pending.length > 0 && !emptyFiltered && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
          {selectMode ? (
            <View style={styles.bulkBar}>
              <TouchableOpacity
                style={[styles.bulkBtn, selected.size === 0 && { opacity: 0.4 }]}
                onPress={focusSelected}
                disabled={selected.size === 0}
                accessibilityRole="button"
              >
                <Feather name="crosshair" size={15} color={colors.textPrimary} />
                <Text style={styles.bulkBtnText}>Focus</Text>
              </TouchableOpacity>
              {hasGroups && (
                <TouchableOpacity
                  style={[styles.bulkBtn, selected.size === 0 && { opacity: 0.4 }]}
                  onPress={() => selected.size > 0 && setBulkGroupSheet(true)}
                  disabled={selected.size === 0}
                  accessibilityRole="button"
                >
                  <Feather name="users" size={15} color={colors.textPrimary} />
                  <Text style={styles.bulkBtnText}>Group</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.bulkSaveBtn, (selected.size === 0 || batchSaving) && { opacity: 0.5 }]}
                onPress={() => saveMany(pending.filter(r => selected.has(r.id)), 'Save selected?')}
                disabled={selected.size === 0 || batchSaving}
                accessibilityRole="button"
              >
                <Text style={styles.bulkSaveText}>{batchSaving ? 'Saving…' : `Save ${selected.size}`}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <PrimaryButton
              label={batchSaving ? 'Saving…' : `Save all ${visibleRows.length}`}
              onPress={() => saveMany(visibleRows, narrowed ? 'Save these?' : 'Save all?')}
              loading={batchSaving}
            />
          )}
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
          onChange={(c) => { applyCategory(catPickerRow, c.name); setCatPickerFor(null); }}
        />
      )}

      {/* Per-row destination sheet. */}
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

      {/* Bulk group assign sheet — shared, non-archived groups only (no Personal). */}
      <SheetModal visible={bulkGroupSheet} onClose={() => setBulkGroupSheet(false)} title={`Assign ${selected.size} to a group`} scroll={false}>
        {(data?.sharedGroups.length ?? 0) === 0 ? (
          <Text style={styles.emptySheet}>No shared groups to assign to.</Text>
        ) : (
          data!.sharedGroups.map(g => (
            <DestOption key={g.id} label={g.name} icon="users" active={false} onPress={() => assignBulkGroup(g.id)} />
          ))
        )}
      </SheetModal>

      {/* Filter sheet — narrows the working set (ephemeral). */}
      <SheetModal visible={filterSheet} onClose={() => setFilterSheet(false)} title="Filter" scroll={false}>
        <FilterForm
          filters={filters}
          categories={distinctCats}
          onChange={setFilters}
          onClear={() => setFilters(DEFAULT_FILTERS)}
          onDone={() => setFilterSheet(false)}
        />
      </SheetModal>

      {/* Overflow menu. */}
      <SheetModal visible={menuOpen} onClose={() => setMenuOpen(false)} title="Review options" scroll={false}>
        <View style={styles.menuCard}>
          <SettingsRow icon="filter" label="Filter" value={hasFilters ? 'On' : undefined} onPress={() => { setMenuOpen(false); setFilterSheet(true); }} />
          <View style={settingsRowDivider} />
          <SettingsRow icon="check-square" label="Select" onPress={() => { setMenuOpen(false); setSelectMode(true); }} />
          <View style={settingsRowDivider} />
          <SettingsRow icon="bookmark" label="Saved views" value={savedViews.length ? String(savedViews.length) : undefined} onPress={() => { setMenuOpen(false); setViewsSheet(true); }} />
          <View style={settingsRowDivider} />
          <SettingsRow icon="save" label="Save current view" onPress={() => { setMenuOpen(false); setSaveViewSheet(true); }} />
        </View>
        <TouchableOpacity style={styles.menuDanger} onPress={() => { setMenuOpen(false); handleClearAll(); }} accessibilityRole="button">
          <Feather name="trash-2" size={16} color={colors.expense} />
          <Text style={styles.menuDangerText}>Clear all</Text>
        </TouchableOpacity>
      </SheetModal>

      {/* Saved views list. */}
      <SheetModal visible={viewsSheet} onClose={() => setViewsSheet(false)} title="Saved views" scroll={false}>
        {savedViews.length === 0 ? (
          <Text style={styles.emptySheet}>No saved views yet. Set a filter, group and payer, then “Save current view”.</Text>
        ) : (
          savedViews.map(v => {
            const gname = v.groupId ? (data?.sharedGroups.find(g => g.id === v.groupId)?.name ?? 'group') : null;
            const pname = v.paidBy ? (data?.groupMembers[v.groupId ?? '']?.find(m => m.id === v.paidBy)?.name ?? null) : null;
            const sub = [gname, pname ? `paid by ${pname}` : null].filter(Boolean).join(' · ');
            return (
              <View key={v.id} style={styles.viewRow}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => applyView(v)} accessibilityRole="button">
                  <Text style={styles.viewName} numberOfLines={1}>{v.name}</Text>
                  {!!sub && <Text style={styles.viewSub} numberOfLines={1}>{sub}</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeView(v.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete ${v.name}`}>
                  <Feather name="trash-2" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </SheetModal>

      {/* Save current filter + group + payer as a named view. */}
      <SheetModal visible={saveViewSheet} onClose={() => setSaveViewSheet(false)} title="Save view" scroll={false}>
        <SaveViewForm
          groups={data?.sharedGroups ?? []}
          membersByGroup={data?.groupMembers ?? {}}
          onCancel={() => setSaveViewSheet(false)}
          onSave={saveView}
        />
      </SheetModal>
    </View>
  );
}

function SaveViewForm({ groups, membersByGroup, onCancel, onSave }: {
  groups: { id: string; name: string }[];
  membersByGroup: Record<string, Person[]>;
  onCancel: () => void;
  onSave: (name: string, groupId: string | null, paidBy: string | null) => void;
}) {
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const members = groupId ? (membersByGroup[groupId] ?? []) : [];
  return (
    <View style={{ gap: space.md }}>
      <View>
        <Text style={styles.fLabel}>NAME</Text>
        <TextInput style={styles.fInput} value={name} onChangeText={setName} placeholder="e.g. Rohan’s UPI" placeholderTextColor={colors.textMuted} autoCorrect={false} />
      </View>
      {groups.length > 0 && (
        <View>
          <Text style={styles.fLabel}>ASSIGN TO GROUP (optional)</Text>
          <View style={styles.fChipRow}>
            <FChip label="None" on={groupId === null} onPress={() => { setGroupId(null); setPaidBy(null); }} />
            {groups.map(g => (
              <FChip key={g.id} label={g.name} on={groupId === g.id} onPress={() => { setGroupId(g.id); setPaidBy(null); }} />
            ))}
          </View>
        </View>
      )}
      {groupId && members.length > 0 && (
        <View>
          <Text style={styles.fLabel}>PAID BY (a member of the group)</Text>
          <View style={styles.fChipRow}>
            {members.map(m => (
              <FChip key={m.id} label={m.name} on={paidBy === m.id} onPress={() => setPaidBy(paidBy === m.id ? null : m.id)} />
            ))}
          </View>
        </View>
      )}
      <View style={styles.fActions}>
        <TouchableOpacity onPress={onCancel} style={styles.fClearBtn} accessibilityRole="button"><Text style={styles.fClearText}>Cancel</Text></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <PrimaryButton label="Save view" onPress={() => onSave(name, groupId, paidBy)} disabled={!name.trim()} />
        </View>
      </View>
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

const AMOUNT_MODES: { key: AmountMode; label: string }[] = [
  { key: 'any', label: 'Any' },
  { key: 'lt', label: '< less' },
  { key: 'gt', label: '> more' },
  { key: 'between', label: 'Between' },
];

function FilterForm({ filters, categories, onChange, onClear, onDone }: {
  filters: ReviewFilters;
  categories: string[];
  onChange: (f: ReviewFilters) => void;
  onClear: () => void;
  onDone: () => void;
}) {
  const set = (p: Partial<ReviewFilters>) => onChange({ ...filters, ...p });
  const [pick, setPick] = useState<'from' | 'to' | null>(null);
  const [timePick, setTimePick] = useState<'from' | 'to' | null>(null);
  const pickValue = pick === 'to'
    ? (parseFilterDate(filters.dateTo, true) ?? Date.now())
    : (parseFilterDate(filters.dateFrom, false) ?? Date.now());
  // Seed the time picker from the bound's existing time, else a sensible default.
  const timeStr = timePick === 'to' ? filters.dateTo : timePick === 'from' ? filters.dateFrom : '';
  const tm = /\s(\d{2}):(\d{2})$/.exec(timeStr);
  const timeValue: TimeValue = tm
    ? { hour: Number(tm[1]), minute: Number(tm[2]) }
    : (timePick === 'to' ? { hour: 23, minute: 59 } : { hour: 0, minute: 0 });
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.md, paddingBottom: space.md }}>
      <View>
        <Text style={styles.fLabel}>NAME</Text>
        <TextInput
          style={styles.fInput}
          value={filters.query}
          onChangeText={(t) => set({ query: t })}
          placeholder="Search description"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
        />
      </View>

      {categories.length > 0 && (
        <View>
          <Text style={styles.fLabel}>CATEGORY</Text>
          <View style={styles.fChipRow}>
            <FChip label="Any" on={filters.category === ''} onPress={() => set({ category: '' })} />
            {categories.map(c => (
              <FChip key={c} label={c} on={filters.category === c} onPress={() => set({ category: c })} />
            ))}
          </View>
        </View>
      )}

      <View>
        <Text style={styles.fLabel}>AMOUNT (₹)</Text>
        <View style={styles.seg}>
          {AMOUNT_MODES.map(m => (
            <TouchableOpacity key={m.key} style={[styles.segBtn, filters.amountMode === m.key && styles.segBtnOn]} onPress={() => set({ amountMode: m.key })} accessibilityRole="button">
              <Text style={[styles.segText, filters.amountMode === m.key && styles.segTextOn]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {filters.amountMode !== 'any' && (
          <View style={styles.fDateRow}>
            <TextInput
              style={styles.fDateInput}
              value={filters.amtA}
              onChangeText={(t) => set({ amtA: t.replace(/[^0-9.]/g, '') })}
              placeholder={filters.amountMode === 'between' ? 'From' : 'Amount'}
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
            />
            {filters.amountMode === 'between' && (
              <TextInput
                style={styles.fDateInput}
                value={filters.amtB}
                onChangeText={(t) => set({ amtB: t.replace(/[^0-9.]/g, '') })}
                placeholder="To"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
            )}
          </View>
        )}
      </View>

      <View>
        <Text style={styles.fLabel}>DATE &amp; TIME RANGE</Text>
        <View style={styles.fDateRow}>
          <TouchableOpacity style={styles.fDateBtn} onPress={() => setPick('from')} accessibilityRole="button" accessibilityLabel="From date and time">
            <Feather name="calendar" size={14} color={colors.textMuted} />
            <Text style={[styles.fDateText, !filters.dateFrom && styles.fDatePlaceholder]}>{filters.dateFrom || 'From'}</Text>
            {!!filters.dateFrom && (
              <TouchableOpacity onPress={() => set({ dateFrom: '' })} hitSlop={8} accessibilityLabel="Clear from date"><Feather name="x" size={13} color={colors.textMuted} /></TouchableOpacity>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.fDateBtn} onPress={() => setPick('to')} accessibilityRole="button" accessibilityLabel="To date and time">
            <Feather name="calendar" size={14} color={colors.textMuted} />
            <Text style={[styles.fDateText, !filters.dateTo && styles.fDatePlaceholder]}>{filters.dateTo || 'To'}</Text>
            {!!filters.dateTo && (
              <TouchableOpacity onPress={() => set({ dateTo: '' })} hitSlop={8} accessibilityLabel="Clear to date"><Feather name="x" size={13} color={colors.textMuted} /></TouchableOpacity>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <DatePickerSheet
        visible={pick !== null}
        value={pickValue}
        onClose={() => setPick(null)}
        onChange={(ms) => {
          const d = format(new Date(ms), 'yyyy-MM-dd');
          const which = pick;
          set(which === 'to' ? { dateTo: d } : { dateFrom: d });
          setPick(null);
          setTimePick(which); // chain into the time picker for this bound
        }}
      />

      <TimePickerSheet
        visible={timePick !== null}
        value={timeValue}
        title="Pick a time (optional)"
        onClose={() => setTimePick(null)}
        onSave={(t) => {
          const cur = timePick === 'to' ? filters.dateTo : filters.dateFrom;
          const datePart = (cur || '').split(' ')[0];
          if (datePart) {
            const withTime = `${datePart} ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
            set(timePick === 'to' ? { dateTo: withTime } : { dateFrom: withTime });
          }
          setTimePick(null);
        }}
      />

      <View>
        <Text style={styles.fLabel}>MATCH</Text>
        <View style={styles.seg}>
          {(['and', 'or'] as const).map(c => (
            <TouchableOpacity key={c} style={[styles.segBtn, filters.combine === c && styles.segBtnOn]} onPress={() => set({ combine: c })} accessibilityRole="button">
              <Text style={[styles.segText, filters.combine === c && styles.segTextOn]}>{c === 'and' ? 'All (AND)' : 'Any (OR)'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.fActions}>
        <TouchableOpacity onPress={onClear} accessibilityRole="button" style={styles.fClearBtn}>
          <Text style={styles.fClearText}>Clear filters</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <PrimaryButton label="Done" onPress={onDone} />
        </View>
      </View>
    </ScrollView>
  );
}

function FChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.fChip, on && styles.fChipOn]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[styles.fChipText, on && styles.fChipTextOn]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.sm },
  headerBlock: { gap: space.xs, marginBottom: space.xs },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerAction: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  selectHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectAll: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  stepLabel: { ...type.caption, color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Inter_600SemiBold' },
  intro: { ...type.label, color: colors.textMuted },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginHorizontal: layout.screenPaddingH, marginBottom: space.xs, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: colors.accentMuted, borderWidth: 1, borderColor: colors.accent + '55' },
  bannerText: { ...type.label, color: colors.textPrimary, flex: 1, fontFamily: 'Inter_600SemiBold' },
  bannerReset: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  assignAll: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: space.xs },
  assignAllLabel: { ...type.caption, color: colors.textMuted },
  assignChip: { paddingHorizontal: space.sm + 2, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: colors.border, maxWidth: 120 },
  assignChipText: { ...type.caption, color: colors.textSecondary },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm, ...shadow.sm },
  cardChecked: { borderColor: colors.accent },
  checkbox: { marginRight: space.xs },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  desc: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', flex: 1 },
  date: { ...type.caption, color: colors.textMuted },
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
  confirmBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.md, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.accent },
  confirmBtnText: { ...type.label, color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: layout.screenPaddingH, paddingTop: space.sm, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  bulkBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bulkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard },
  bulkBtnText: { ...type.label, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  bulkSaveBtn: { flex: 1, height: 48, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  bulkSaveText: { ...type.button, color: colors.bg },
  emptySheet: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: space.lg },
  menuCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  menuDanger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, marginTop: space.md, paddingVertical: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  menuDangerText: { ...type.body, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
  viewRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  viewName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  viewSub: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  destOption: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: radius.md },
  destOptionOn: { backgroundColor: colors.bgMuted },
  destOptionText: { ...type.body, color: colors.textPrimary },
  // Filter form
  fLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: 'Inter_600SemiBold', marginBottom: 6 },
  fInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: 10 },
  fChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fChip: { paddingHorizontal: space.sm + 2, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: colors.border, maxWidth: 160 },
  fChipOn: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  fChipText: { ...type.label, color: colors.textSecondary },
  fChipTextOn: { color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  seg: { flexDirection: 'row', backgroundColor: colors.bgMuted, borderRadius: radius.md, padding: 3, gap: 3 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.sm },
  segBtnOn: { backgroundColor: colors.accent },
  segText: { ...type.label, color: colors.textSecondary },
  segTextOn: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  fDateRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  fDateInput: { flex: 1, ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: 10 },
  fDateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: 12 },
  fDateText: { ...type.body, color: colors.textPrimary, flex: 1 },
  fDatePlaceholder: { color: colors.textMuted },
  fActions: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
  fClearBtn: { paddingHorizontal: space.md, paddingVertical: 12 },
  fClearText: { ...type.label, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
});
