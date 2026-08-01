import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
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
import { SectionLabel } from '../src/components/ui/SectionLabel';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { SheetModal } from '../src/components/ui/SheetModal';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { SkeletonCard } from '../src/components/ui/Skeleton';
import { SettingsRow, settingsRowDivider } from '../src/components/ui/SettingsRow';
import { AppRefreshControl } from '../src/components/ui/AppRefreshControl';
import { CategoryPicker } from '../src/components/finance/CategoryPicker';
import { MemberAvatar } from '../src/components/finance/MemberAvatar';
import type { ParsedDirection } from '../src/lib/importParse';
import { SplitEditor } from '../src/components/finance/add/SplitEditor';
import {
  effectiveRow, effectiveSplit, snapshotRow, planCommit as planCommitPure,
  type RowEdit, type SplitState, type CommitPlan, type ReviewContext,
} from '../src/lib/reviewCommit';
import { FilterForm } from '../src/components/finance/review/FilterForm';
import { SaveViewForm } from '../src/components/finance/review/SaveViewForm';
import { DestOption } from '../src/components/finance/review/DestOption';
import {
  getPending, deletePending, clearPending, updatePendingDraft, restorePending,
  type PendingTxn, type PendingDraft,
} from '../src/db/queries/pending';
import { insertTxn, softDeleteTxn } from '../src/db/queries/transactions';
import { convertToRecurring } from '../src/db/queries/recurring';
import { getMe, getGroupMembers, type Person } from '../src/db/queries/persons';
import { getAllGroups } from '../src/db/queries/groups';
import { getCategories, type Category } from '../src/db/queries/categories';
import { parseToPaise, formatRupees, splitByMode } from '../src/lib/money';
import { recordCorrection } from '../src/lib/smartCategoryLearn';
import { detectRecurringCandidates, type RecurRow, type RecurringCandidate } from '../src/lib/recurringSuggest';
import { RecurringSuggestionBanner } from '../src/components/finance/review/RecurringSuggestionBanner';
import { RecurringSuggestionsSheet } from '../src/components/finance/review/RecurringSuggestionsSheet';
import { useFeatureFlags } from '../src/components/system/FeatureFlagsProvider';
import {
  type ReviewFilters, DEFAULT_FILTERS,
  filtersActive, rowMatches, isSimilarMerchant,
} from '../src/lib/reviewFilter';
import { type SavedView, loadViews, upsertView, deleteView, makeViewId } from '../src/lib/reviewViews';
import { useScreenData } from '../src/hooks/useScreenData';
import { useDataRefresh } from '../src/components/system/DataRefreshProvider';
import { useUndo } from '../src/components/system/UndoToast';
import { haptic } from '../src/lib/haptics';
import {
  type TxnKind, type SplitMode, type PayMethod, type TxnSource,
  PAY_METHOD, PAY_METHOD_LABEL, PAY_METHOD_EMOJI, TXN_KIND_LABEL,
  TXN_SOURCE, TXN_SOURCE_LABEL, TXN_SOURCE_ICON,
} from '../src/constants/enums';
import { alpha } from '../src/theme';

// One screen: every pending row is fully editable in place. dest = 'personal' or a
// group id; picking a group reveals the inline split. Edits auto-save (draft) to
// pending_txn; only Confirm/Save commits a row into a real transaction.
// payMethod: '' = none/unset (row need not have one).
/** Kind chips on each row. "Transfer" is the UI name for a `settlement` — money
 *  moving between accounts or people, which is neither spend nor earnings. */
const KIND_CHIPS: { kind: TxnKind; label: string }[] = [
  { kind: 'expense', label: 'Exp' },
  { kind: 'income', label: 'Inc' },
  { kind: 'settlement', label: 'Txfr' },
];

const BATCH = '__batch__';

export default function ReviewScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useDataRefresh();
  const { showUndo } = useUndo();
  const { flags } = useFeatureFlags();
  const [recurCandidates, setRecurCandidates] = useState<RecurringCandidate[]>([]);
  const [showRecurSheet, setShowRecurSheet] = useState(false);
  const [edits, setEdits] = useState<Record<string, Partial<RowEdit>>>({});
  const [splits, setSplits] = useState<Record<string, SplitState>>({});
  const [catPickerFor, setCatPickerFor] = useState<string | null>(null);
  const [destSheetFor, setDestSheetFor] = useState<string | null>(null);
  const [paySheetFor, setPaySheetFor] = useState<string | null>(null);
  // "Who was this transfer with?" — the counterparty picker for a group transfer.
  const [whoSheetFor, setWhoSheetFor] = useState<string | null>(null);
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

  const { data, loading, error, refreshing, onRefresh, reload } = useScreenData(async (db) => {
    const me = await getMe(db);
    const groups = await getAllGroups(db);
    const personalId = groups.find(g => g.is_personal === 1)?.id ?? groups[0]?.id ?? '';
    // A pending row can only be assigned to an active shared group.
    const shared = groups.filter(g => g.is_personal !== 1 && g.is_archived !== 1);
    const [pending, expenseCats, incomeCats, transferCats, ...memberLists] = await Promise.all([
      getPending(db),
      getCategories(db, 'expense'),
      getCategories(db, 'income'),
      getCategories(db, 'transfer'),
      ...shared.map(g => getGroupMembers(db, g.id)),
    ]);
    const groupMembers: Record<string, Person[]> = {};
    shared.forEach((g, i) => { groupMembers[g.id] = memberLists[i] as Person[]; });
    return {
      pending, meId: me?.id ?? '', personalId,
      sharedGroups: shared.map(g => ({ id: g.id, name: g.name })),
      groupMembers, expenseCats, incomeCats, transferCats,
    };
  }, []);

  const pending = data?.pending ?? [];
  const hasGroups = (data?.sharedGroups.length ?? 0) > 0;
  const batchSaving = savingId === BATCH;

  // Thin bindings from screen state to the pure helpers in lib/reviewCommit.
  const eff = (row: PendingTxn): RowEdit => effectiveRow(row, edits[row.id]);
  const splitState = (row: PendingTxn): SplitState =>
    effectiveSplit(row, splits[row.id], data?.groupMembers[eff(row).dest] ?? []);
  const ctx = (): ReviewContext => ({
    meId: data?.meId ?? '',
    personalId: data?.personalId ?? '',
    sharedGroups: data?.sharedGroups ?? [],
    groupMembers: data?.groupMembers ?? {},
    viewPaidBy: activeView?.paidBy,
  });
  const planCommit = (row: PendingTxn): CommitPlan =>
    planCommitPure(ctx(), row, eff(row), splitState(row));

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
    if (p.payMethod !== undefined) draft.pay_method = p.payMethod === '' ? null : p.payMethod;
    if (p.counterparty !== undefined) draft.counterparty_id = p.counterparty === '' ? null : p.counterparty;
    if (p.direction !== undefined) draft.direction = p.direction;
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
      // Drop any counterparty too — it belonged to the group being moved away from.
      for (const id of ids) next[id] = { ...next[id], dest, counterparty: '' };
      return next;
    });
    const gid = dest === 'personal' ? null : dest;
    for (const id of ids) updatePendingDraft(db, id, { dest_group_id: gid, counterparty_id: null }).catch(() => {});
  };
  const setAllDest = (dest: string) => { haptic.selection(); setDestMany(visibleRows.map(r => r.id), dest); };

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

  /**
   * Scoped to the batch just committed (no lifetime history scan) — flags
   * transactions that look recurring so the user can turn them into a rule.
   * Never fires for manually-typed rows (nothing to detect a pattern from
   * beyond what the user already knows they're entering).
   */
  function checkRecurringSuggestions(done: { txnId: string; snap: PendingTxn }[]) {
    if (!flags.recurringSuggest) return;
    const rows: RecurRow[] = done
      .filter(d => d.snap.kind === 'expense' && (d.snap.source ?? 'manual') !== 'manual' && d.snap.category)
      .map(d => ({ id: d.txnId, description: d.snap.description, amountPaise: d.snap.amount, date: d.snap.date, category: d.snap.category! }));
    const candidates = detectRecurringCandidates(rows);
    if (candidates.length > 0) setRecurCandidates(candidates);
  }

  async function confirmRecurringSuggestions(chosen: RecurringCandidate[]) {
    for (const c of chosen) {
      await convertToRecurring(db, c.mostRecentTxnId, 'monthly', 1).catch(() => {});
    }
    haptic.success();
    setShowRecurSheet(false);
    setRecurCandidates([]);
    refresh();
    reload();
  }

  // ---- commit path (shared by per-row Confirm and batch Save) --------------

  /** Insert a planned row and drop it from the inbox. Returns undo material. */
  async function insertCommit(row: PendingTxn, plan: Extract<CommitPlan, { ok: true }>): Promise<{ txnId: string; snap: PendingTxn }> {
    const txnId = await insertTxn(db, {
      groupId: plan.groupId, kind: plan.kind, entryMode: 'quick', date: row.date,
      category: plan.category, note: row.description, payMethod: plan.payMethod,
      payments: plan.payments ?? [{ personId: plan.payer, amount: plan.total }],
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
      Alert.alert('Nothing ready to save', 'These rows still need an amount — a balanced split for group expenses, or who the transfer was with for group transfers.');
      return;
    }
    Alert.alert(
      label,
      `${ready.length} transaction${ready.length === 1 ? '' : 's'} will be saved${skipped > 0 ? `. ${skipped} skipped — they need an amount, a balanced split, or who the transfer was with.` : '.'}`,
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
            checkRecurringSuggestions(done);
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
    const snap = snapshotRow(row, eff(row), splitState(row));
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
  // A plain render function (NOT a nested component): rendering <RowCard/> as a
  // component defined inside ReviewScreen remounts it on every keystroke, which
  // drops focus and closes the keyboard while typing the amount. Inlining keeps
  // the TextInput mounted across re-renders.
  const renderRow = (row: PendingTxn) => {
    const v = eff(row);
    const vis = categoryVisual(v.category);
    const isGroup = v.dest !== 'personal';
    const isTransfer = v.kind === 'settlement';
    const groupName = isGroup ? (data?.sharedGroups.find(g => g.id === v.dest)?.name ?? 'Group') : 'Personal';
    const gm = isGroup ? (data?.groupMembers[v.dest] ?? []) : [];
    // A transfer into a group settles with one member instead of splitting.
    const splitting = isGroup && !isTransfer;
    const total = parseToPaise(v.amount);
    const st = splitState(row);
    const shares = splitting ? splitByMode(total, st.included, st.mode, st.values) : {};
    const assigned = splitting ? st.included.reduce((s, id) => s + (shares[id] ?? 0), 0) : total;
    const balanced = !splitting || (st.included.length > 0 && assigned === total);
    // A group transfer can't be saved until you say who it was with.
    const other = gm.find(m => m.id === v.counterparty) ?? null;
    const inbound = v.direction === 'credit';
    const ready = balanced && (!isGroup || !isTransfer || other !== null);
    const saving = savingId === row.id;
    const checked = selected.has(row.id);

    return (
      <Swipeable
        renderRightActions={() => (
          <TouchableOpacity
            style={styles.swipeDelete}
            onPress={() => deleteRow(row)}
            accessibilityRole="button"
            accessibilityLabel="Remove from review"
          >
            <Feather name="trash-2" size={18} color={colors.onAccent} />
            <Text style={styles.swipeDeleteText}>Remove</Text>
          </TouchableOpacity>
        )}
        overshootRight={false}
        friction={2}
        rightThreshold={40}
      >
        <View style={[styles.card, selectMode && checked && styles.cardChecked]}>
          <View style={styles.rowTop}>
            {selectMode && (
              <TouchableOpacity onPress={() => toggleSelect(row.id)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={`Select ${row.description}`} style={styles.checkbox}>
                <Feather name={checked ? 'check-circle' : 'circle'} size={20} color={checked ? colors.accent : colors.textMuted} />
              </TouchableOpacity>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.desc} numberOfLines={1}>{row.description}</Text>
            <Text style={styles.date}>{format(row.date, 'd MMM · h:mm a')}</Text>
          </View>
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
            {KIND_CHIPS.map(({ kind: k, label }) => (
              <TouchableOpacity
                key={k}
                style={[styles.kindBtn, v.kind === k && KIND_ON_STYLE[k]]}
                // Switching kind clears the category — the picker's list changes
                // with it, so keeping the old name would show a stale chip.
                onPress={() => { haptic.selection(); patch(row.id, k === 'expense' ? { kind: k, category: '' } : { kind: k, category: '', dest: 'personal' }); }}
                accessibilityRole="button"
                accessibilityLabel={TXN_KIND_LABEL[k]}
                accessibilityState={{ selected: v.kind === k }}
              >
                <Text style={[styles.kindText, v.kind === k && styles.kindTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.discardBtn} onPress={() => deleteRow(row)} accessibilityRole="button" accessibilityLabel="Remove">
            <Feather name="trash-2" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity style={styles.pill} onPress={() => setCatPickerFor(row.id)} accessibilityRole="button" accessibilityLabel="Category">
            <View style={[styles.pillDot, { backgroundColor: alpha(vis.color ?? colors.accent, 13) }]}>
              <Feather name={asFeather(vis.icon, 'tag')} size={12} color={vis.color ?? colors.accent} />
            </View>
            <Text style={styles.pillText} numberOfLines={1}>{v.category || 'Category'}</Text>
            <Feather name="chevron-down" size={12} color={colors.textMuted} />
          </TouchableOpacity>
          {hasGroups && v.kind !== 'income' && (
            <TouchableOpacity style={[styles.pill, isGroup && styles.pillGroup]} accessibilityState={{ selected: isGroup }} onPress={() => setDestSheetFor(row.id)} accessibilityRole="button" accessibilityLabel="Personal or group">
              <Feather name={isGroup ? 'users' : 'user'} size={12} color={isGroup ? colors.settle : colors.textSecondary} />
              <Text style={[styles.pillText, isGroup && { color: colors.settle }]} numberOfLines={1}>{groupName}</Text>
              <Feather name="chevron-down" size={12} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Transfer specifics: which way the money went, and (in a group) who
            with. Direction is seeded from the statement, but not every export
            signs its amounts — and money arriving can be a transfer TO you
            rather than income — so it's a tap to flip. */}
        {isTransfer && (
          <View style={styles.controls}>
            <TouchableOpacity
              style={styles.pill}
              onPress={() => { haptic.selection(); patch(row.id, { direction: inbound ? 'debit' : 'credit' }); }}
              accessibilityRole="button"
              accessibilityLabel={inbound ? 'Money in — tap to change to money out' : 'Money out — tap to change to money in'}
            >
              <Feather
                name={inbound ? 'arrow-down-left' : 'arrow-up-right'}
                size={12}
                color={inbound ? colors.income : colors.expense}
              />
              <Text style={[styles.pillText, { color: inbound ? colors.income : colors.expense }]} numberOfLines={1}>
                {inbound ? 'Money in' : 'Money out'}
              </Text>
              <Feather name="repeat" size={11} color={colors.textMuted} />
            </TouchableOpacity>
            {isGroup ? (
              <TouchableOpacity
                style={[styles.pill, other ? styles.pillGroup : styles.pillNeeded]}
                onPress={() => setWhoSheetFor(row.id)}
                accessibilityRole="button"
                accessibilityLabel={inbound ? 'Who paid you' : 'Who you paid'}
              >
                <Feather name="user" size={12} color={other ? colors.settle : colors.expense} />
                <Text style={[styles.pillText, { color: other ? colors.settle : colors.expense }]} numberOfLines={1}>
                  {other ? `${inbound ? 'From' : 'To'} ${other.name}` : (inbound ? 'From whom?' : 'To whom?')}
                </Text>
                <Feather name="chevron-down" size={12} color={colors.textMuted} />
              </TouchableOpacity>
            ) : (
              <View style={{ flex: 1 }} />
            )}
          </View>
        )}

        {/* Pay method — pre-filled from detection when the source carried a cue. */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.payPill, v.payMethod !== '' && styles.payPillSet]}
            onPress={() => setPaySheetFor(row.id)}
            accessibilityRole="button"
            accessibilityLabel={v.payMethod ? `Paid via ${PAY_METHOD_LABEL[v.payMethod]}` : 'Set payment method'}
          >
            <Text style={styles.payEmoji}>{v.payMethod ? PAY_METHOD_EMOJI[v.payMethod] : '💳'}</Text>
            <Text style={[styles.pillText, v.payMethod !== '' && { color: colors.textPrimary }]} numberOfLines={1}>
              {v.payMethod ? PAY_METHOD_LABEL[v.payMethod] : 'Pay method'}
            </Text>
            <Feather name="chevron-down" size={12} color={colors.textMuted} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
        </View>

        {/* Inline split — group expenses only; a group transfer settles instead. */}
        {splitting && (
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
              style={[styles.confirmBtn, (!ready || saving || batchSaving) && { opacity: 0.5 }]}
              onPress={() => confirmRow(row)}
              disabled={!ready || saving || batchSaving}
              accessibilityRole="button"
              accessibilityLabel="Save this transaction"
            >
              <Feather name="check" size={14} color={colors.bg} />
              <Text style={styles.confirmBtnText}>{saving ? 'Saving…' : 'Confirm'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      </Swipeable>
    );
  }

  const catPickerRow = catPickerFor ? pending.find(r => r.id === catPickerFor) ?? null : null;
  const catPickerKind = catPickerRow ? eff(catPickerRow).kind : 'expense';
  const catList: Category[] = catPickerKind === 'income'
    ? (data?.incomeCats ?? [])
    : catPickerKind === 'settlement'
    ? (data?.transferCats ?? [])
    : (data?.expenseCats ?? []);
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

  // Group the working set into sections by source, in the canonical source order.
  // Section headers only appear when more than one source is present (a single
  // source needs no header — the screen title already says "Review").
  const sections = TXN_SOURCE
    .map(src => ({ source: src, data: visibleRows.filter(r => (r.source ?? 'manual') === src) }))
    .filter(s => s.data.length > 0);
  const multiSource = sections.length > 1;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Review"
        subtitle={
          loading || pending.length === 0
            ? undefined
            : selectMode
            ? `${selected.size} selected of ${visibleRows.length}`
            : narrowed || activeView
            ? `${visibleRows.length} of ${pending.length}`
            : `${pending.length} to review`
        }
        onBack={() => router.back()}
        right={headerRight}
      />

      {/* Recurring suggestion — surfaces after a batch Save, never auto-created. */}
      {!loading && recurCandidates.length > 0 && (
        <RecurringSuggestionBanner
          count={recurCandidates.length}
          onPress={() => setShowRecurSheet(true)}
          onDismiss={() => setRecurCandidates([])}
        />
      )}

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
          body="Import a Google Pay statement, a bank / UPI export, or a transaction-alert email (Settings → Import) and the transactions show up here — grouped by source — to confirm."
          actionLabel="Import transactions"
          onAction={() => router.push('/import')}
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
        <SectionList
          sections={sections}
          keyExtractor={r => r.id}
          renderItem={({ item }) => renderRow(item)}
          renderSectionHeader={({ section }) => multiSource ? (
            <SectionLabel count={section.data.length}>
              {TXN_SOURCE_LABEL[(section as { source: TxnSource }).source]}
            </SectionLabel>
          ) : null}
          stickySectionHeadersEnabled={false}
          refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 96 }]}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          windowSize={8}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              {selectMode ? (
                <View style={styles.selectHeader}>
                  <TouchableOpacity onPress={toggleSelectAll} hitSlop={6} accessibilityRole="button" style={styles.selectAllBtn}>
                    <Feather name={allVisibleSelected ? 'square' : 'check-square'} size={14} color={colors.accent} />
                    <Text style={styles.selectAll}>{allVisibleSelected ? 'Clear' : 'Select all'}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                hasGroups && (
                  <View style={styles.assignAll}>
                    <Text style={styles.assignAllLabel}>Assign all to</Text>
                    <TouchableOpacity style={styles.assignChip} onPress={() => setAllDest('personal')} accessibilityRole="button" accessibilityLabel="Assign all to Personal">
                      <Feather name="user" size={12} color={colors.textSecondary} />
                      <Text style={styles.assignChipText}>Personal</Text>
                    </TouchableOpacity>
                    {data!.sharedGroups.slice(0, 3).map(g => (
                      <TouchableOpacity key={g.id} style={styles.assignChip} onPress={() => setAllDest(g.id)} accessibilityRole="button" accessibilityLabel={`Assign all to ${g.name}`}>
                        <Feather name="users" size={12} color={colors.textSecondary} />
                        <Text style={styles.assignChipText} numberOfLines={1}>{g.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )
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
            <DestOption label="Personal" icon="user" active={eff(pending.find(r => r.id === destSheetFor)!).dest === 'personal'} onPress={() => { patch(destSheetFor, { dest: 'personal', counterparty: '' }); setDestSheetFor(null); }} />
            {data?.sharedGroups.map(g => (
              <DestOption key={g.id} label={g.name} icon="users" active={eff(pending.find(r => r.id === destSheetFor)!).dest === g.id} onPress={() => { patch(destSheetFor, { dest: g.id, counterparty: '' }); setDestSheetFor(null); }} />
            ))}
          </>
        )}
      </SheetModal>

      {/* Per-row transfer counterparty. Lists the chosen group's other members —
          settling with yourself isn't a thing, so you're excluded. */}
      <SheetModal
        visible={whoSheetFor !== null}
        onClose={() => setWhoSheetFor(null)}
        title={whoSheetFor && pending.find(r => r.id === whoSheetFor)?.direction === 'credit' ? 'Who paid you?' : 'Who did you pay?'}
        scroll={false}
      >
        {whoSheetFor && (() => {
          const r = pending.find(x => x.id === whoSheetFor);
          if (!r) return null;
          const v = eff(r);
          const members = (data?.groupMembers[v.dest] ?? []).filter(m => m.id !== data?.meId);
          if (members.length === 0) {
            return <Text style={styles.whoEmpty}>This group has no other members yet. Add someone to it first, or keep this transfer personal.</Text>;
          }
          return members.map(m => (
            <DestOption
              key={m.id}
              label={m.name}
              leading={<MemberAvatar name={m.name} color={m.avatar_color} size={28} imageUri={m.image_uri} />}
              active={v.counterparty === m.id}
              onPress={() => { patch(whoSheetFor, { counterparty: m.id }); setWhoSheetFor(null); }}
            />
          ));
        })()}
      </SheetModal>

      {/* Per-row pay-method sheet. */}
      <SheetModal visible={paySheetFor !== null} onClose={() => setPaySheetFor(null)} title="How was it paid?" scroll={false}>
        {paySheetFor && (() => {
          const current = eff(pending.find(r => r.id === paySheetFor)!).payMethod;
          const choose = (m: PayMethod | '') => { patch(paySheetFor, { payMethod: m }); setPaySheetFor(null); };
          return (
            <>
              {PAY_METHOD.map(m => (
                <TouchableOpacity key={m} style={[styles.payOption, current === m && styles.payOptionOn]} onPress={() => choose(m)} accessibilityRole="button" accessibilityState={{ selected: current === m }}>
                  <Text style={styles.payOptionEmoji}>{PAY_METHOD_EMOJI[m]}</Text>
                  <Text style={[styles.payOptionText, current === m && { color: colors.accent, fontFamily: 'Inter_600SemiBold' }]}>{PAY_METHOD_LABEL[m]}</Text>
                  {current === m && <Feather name="check" size={16} color={colors.accent} style={{ marginLeft: 'auto' }} />}
                </TouchableOpacity>
              ))}
              {current !== '' && (
                <TouchableOpacity style={styles.payClear} onPress={() => choose('')} accessibilityRole="button">
                  <Feather name="x" size={15} color={colors.textMuted} />
                  <Text style={styles.payClearText}>Clear</Text>
                </TouchableOpacity>
              )}
            </>
          );
        })()}
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

      {/* Recurring suggestions — confirm which candidates become tracked rules. */}
      <RecurringSuggestionsSheet
        visible={showRecurSheet}
        onClose={() => setShowRecurSheet(false)}
        candidates={recurCandidates}
        onConfirm={confirmRecurringSuggestions}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.sm },
  headerBlock: { gap: space.xs, marginBottom: space.xs },
  headerAction: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  selectHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectAll: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  selectAllBtn: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: space.xs },
  stepLabel: { ...type.caption, color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Inter_600SemiBold' },
  intro: { ...type.label, color: colors.textMuted },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginHorizontal: layout.screenPaddingH, marginBottom: space.xs, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: colors.accentMuted, borderWidth: 1, borderColor: alpha(colors.accent, 33) },
  bannerText: { ...type.label, color: colors.textPrimary, flex: 1, fontFamily: 'Inter_600SemiBold' },
  bannerReset: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  assignAll: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: space.xs },
  assignAllLabel: { ...type.caption, color: colors.textMuted },
  assignChip: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm + 2, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: colors.border, maxWidth: 140 },
  assignChipText: { ...type.caption, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm, ...shadow.sm },
  cardChecked: { borderColor: colors.accent },
  checkbox: { marginRight: space.xs },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  desc: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', flex: 1 },
  date: { ...type.caption, color: colors.textMuted },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  amtWrap: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.sm, flex: 1 },
  rupee: { ...type.body, color: colors.textMuted },
  amtInput: { flex: 1, ...type.body, color: colors.textPrimary, fontFamily: 'SpaceMono_400Regular', paddingVertical: space.sm },
  kindToggle: { flexDirection: 'row', backgroundColor: colors.bgMuted, borderRadius: radius.md, padding: 2 },
  kindBtn: { paddingHorizontal: space.sm, paddingVertical: 6, borderRadius: radius.sm },
  kindExpense: { backgroundColor: colors.expense },
  kindIncome: { backgroundColor: colors.income },
  kindSettle: { backgroundColor: colors.settle },
  pillNeeded: { borderColor: colors.expense, backgroundColor: alpha(colors.expense, 9) },
  whoEmpty: { ...type.body, color: colors.textSecondary, padding: space.md, lineHeight: 20 },
  kindText: { ...type.label, color: colors.textSecondary },
  kindTextOn: { color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  pill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgMuted, borderRadius: radius.pill, paddingHorizontal: space.sm + 2, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
  pillGroup: { borderColor: alpha(colors.settle, 33) },
  pillDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pillText: { ...type.label, color: colors.textSecondary, flex: 1 },
  payPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgMuted, borderRadius: radius.pill, paddingHorizontal: space.sm + 2, paddingVertical: 7, borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start', maxWidth: '60%' },
  payPillSet: { borderColor: alpha(colors.accent, 33) },
  payEmoji: { fontSize: 14 },
  payOption: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: radius.md },
  payOptionOn: { backgroundColor: colors.bgMuted },
  payOptionEmoji: { fontSize: 18 },
  payOptionText: { ...type.body, color: colors.textPrimary },
  payClear: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, marginTop: space.sm, paddingVertical: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  payClearText: { ...type.label, color: colors.textMuted, fontFamily: 'Inter_600SemiBold' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.md, paddingBottom: space.xs },
  sectionIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  sectionHeaderText: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Inter_600SemiBold', flex: 1 },
  sectionHeaderCount: { ...type.caption, color: colors.textSecondary, fontFamily: 'SpaceMono_400Regular' },
  discardBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgMuted },
  swipeDelete: { width: 96, marginBottom: space.sm, backgroundColor: colors.expense, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: 4 },
  swipeDeleteText: { ...type.caption, color: colors.onAccent, fontFamily: 'Inter_600SemiBold' },
  splitMeta: { ...type.label, color: colors.textSecondary, flexShrink: 1 },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.accent },
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
  // Filter form
});

/** Fill for the selected kind chip. Declared after `styles` so it can reference it. */
const KIND_ON_STYLE: Record<TxnKind, object> = {
  expense: styles.kindExpense,
  income: styles.kindIncome,
  settlement: styles.kindSettle,
};
