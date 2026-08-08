import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, layout } from '../src/constants/layout';
import { asFeather } from '../src/constants/palette';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { SheetModal } from '../src/components/ui/SheetModal';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { SecondaryButton } from '../src/components/ui/SecondaryButton';
import { Banner } from '../src/components/ui/Banner';
import { Chip } from '../src/components/ui/Chip';
import { SkeletonCard } from '../src/components/ui/Skeleton';
import { AppRefreshControl } from '../src/components/ui/AppRefreshControl';
import { CategoryPicker } from '../src/components/finance/CategoryPicker';
import type { ParsedDirection } from '../src/lib/importParse';
import {
  effectiveRow, effectiveSplit, snapshotRow, planCommit as planCommitPure, txnInputFromPlan,
  type RowEdit, type SplitState, type CommitPlan, type ReviewContext,
} from '../src/lib/reviewCommit';
import { FilterForm } from '../src/components/finance/review/FilterForm';
import { SaveViewForm } from '../src/components/finance/review/SaveViewForm';
import { ReviewRowCard } from '../src/components/finance/review/ReviewRowCard';
import { ReviewDestSheet } from '../src/components/finance/review/ReviewDestSheet';
import { CounterpartySheet } from '../src/components/finance/review/CounterpartySheet';
import { BulkGroupSheet } from '../src/components/finance/review/BulkGroupSheet';
import { ReviewOverflowSheet } from '../src/components/finance/review/ReviewOverflowSheet';
import { SavedViewsSheet } from '../src/components/finance/review/SavedViewsSheet';
import { PayMethodSheet } from '../src/components/finance/add/PayMethodSheet';
import {
  getPending, deletePending, clearPending, updatePendingDraft, restorePending,
  type PendingTxn, type PendingDraft,
} from '../src/db/queries/pending';
import { insertTxn, softDeleteTxn, findDuplicatesAmong } from '../src/db/queries/transactions';
import { confirmDuplicates } from '../src/lib/confirm';
import { convertToRecurring } from '../src/db/queries/recurring';
import { getMe, getGroupMembers, type Person } from '../src/db/queries/persons';
import { getAllGroups } from '../src/db/queries/groups';
import { getCategories, type Category } from '../src/db/queries/categories';
import { parseToPaise } from '../src/lib/money';
import { recordCorrection } from '../src/lib/smartCategoryLearn';
import { detectRecurringCandidates, toRecurRows, type RecurringCandidate } from '../src/lib/recurringSuggest';
import { RecurringSuggestionBanner } from '../src/components/finance/review/RecurringSuggestionBanner';
import { RecurringSuggestionsSheet } from '../src/components/finance/review/RecurringSuggestionsSheet';
import { useFeatureFlags } from '../src/components/system/FeatureFlagsProvider';
import {
  type ReviewFilters, DEFAULT_FILTERS,
  filtersActive, deriveWorkingSet, isSimilarMerchant,
} from '../src/lib/reviewFilter';
import { type SavedView, loadViews, upsertView, deleteView, makeViewId } from '../src/lib/reviewViews';
import { useScreenData } from '../src/hooks/useScreenData';
import { useContentInset } from '../src/hooks/useContentInset';
import { useDataRefresh } from '../src/components/system/DataRefreshProvider';
import { useUndo } from '../src/components/system/UndoToast';
import { haptic } from '../src/lib/haptics';
import {
  type TxnSource, TXN_SOURCE, TXN_SOURCE_LABEL, TXN_SOURCE_ICON,
} from '../src/constants/enums';
import { alpha } from '../src/theme';

// One screen: every pending row is fully editable in place. dest = 'personal' or a
// group id; picking a group reveals the inline split. Edits auto-save (draft) to
// pending_txn; only Confirm/Save commits a row into a real transaction.
// payMethod: '' = none/unset (row need not have one).
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
  // Measured, not guessed: the footer swaps between one CTA and a three-button bulk
  // bar, so a literal bottom inset (this was `insets.bottom + 96`) is wrong in one
  // mode or the other.
  const [footerH, setFooterH] = useState(0);

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

  // Footer height is measured (see `footerH`), so the last row always clears it.
  const listPad = useContentInset({ footer: footerH });

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
  const filterRowOf = (row: PendingTxn) => ({ description: row.description, category: eff(row).category, amountPaise: parseToPaise(eff(row).amount), date: row.date });
  const { visibleRows, baseRows, focusActive, hasFilters, narrowed, distinctCats } =
    deriveWorkingSet(pending, focusIds, filters, filterRowOf, row => eff(row).category);

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
    const candidates = detectRecurringCandidates(toRecurRows(done));
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
    const txnId = await insertTxn(db, txnInputFromPlan(row, plan));
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
    // Re-importing an overlapping statement is normal, so this path needs the same
    // ±24 h warning Quick Add has always had (`V2-20`).
    const dupes = await findDuplicatesAmong(db, [{ groupId: plan.groupId, kind: plan.kind, category: plan.category, total: plan.total, dateMs: row.date }]);
    if (dupes.length > 0 && !(await confirmDuplicates(1, 1))) return;

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
  async function saveMany(rows: PendingTxn[], label: string) {
    if (savingId) return;
    const ready = rows.map(r => ({ row: r, plan: planCommit(r) })).filter((x): x is { row: PendingTxn; plan: Extract<CommitPlan, { ok: true }> } => x.plan.ok);
    const skipped = rows.length - ready.length;
    if (ready.length === 0) {
      Alert.alert('Nothing ready to save', 'These rows still need an amount — a balanced split for group expenses, or who the transfer was with for group transfers.');
      return;
    }
    const dupes = await findDuplicatesAmong(db, ready.map(({ row, plan }) => ({ groupId: plan.groupId, kind: plan.kind, category: plan.category, total: plan.total, dateMs: row.date })));
    if (dupes.length > 0 && !(await confirmDuplicates(dupes.length, ready.length))) return;
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
      const inView = deriveWorkingSet(pending, null, view.filters, filterRowOf, r => eff(r).category).visibleRows;
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
  // `ReviewRowCard` lives at MODULE scope in components/finance/review. Declaring it
  // inside this component would create a new component *type* every render, which
  // remounts the subtree and drops keyboard focus mid-digit while typing an amount.
  // See the note in that file before moving it.

  // The row each per-row sheet is editing. Resolved here rather than inside the
  // sheet's JSX so a sheet never has to re-find its own row (the old inline
  // versions did `pending.find(...)!` up to three times in one element).
  const rowById = (id: string | null) => (id ? pending.find(r => r.id === id) ?? null : null);
  const destRow = rowById(destSheetFor);
  const payRow = rowById(paySheetFor);
  const whoRow = rowById(whoSheetFor);
  const whoMembers = whoRow
    ? (data?.groupMembers[eff(whoRow).dest] ?? []).filter(m => m.id !== data?.meId)
    : [];

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
      <ScreenHeader title="Review" onBack={() => router.back()} right={headerRight} />

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
        <Banner
          icon={activeView ? 'bookmark' : focusActive ? 'crosshair' : 'filter'}
          text={`${activeView ? activeView.name : focusActive ? 'Focus' : 'Filtered'} · ${visibleRows.length} of ${pending.length}${activePayerName ? ` · paid by ${activePayerName}` : ''}`}
          actionLabel="Show all"
          onAction={exitFocus}
        />
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
          renderItem={({ item }) => (
            <ReviewRowCard
              row={item}
              v={eff(item)}
              st={splitState(item)}
              sharedGroups={data?.sharedGroups ?? []}
              groupMembers={data?.groupMembers ?? {}}
              hasGroups={hasGroups}
              selectMode={selectMode}
              checked={selected.has(item.id)}
              saving={savingId === item.id}
              batchSaving={batchSaving}
              onToggleSelect={toggleSelect}
              onAmountChange={patchAmountLocal}
              onAmountBlur={flushAmount}
              onPatch={patch}
              onSplitChange={patchSplit}
              onOpenCategory={setCatPickerFor}
              onOpenDest={setDestSheetFor}
              onOpenCounterparty={setWhoSheetFor}
              onOpenPay={setPaySheetFor}
              onConfirm={confirmRow}
              onDiscard={deleteRow}
            />
          )}
          renderSectionHeader={({ section }) => multiSource ? (
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIcon}>
                <Feather name={asFeather(TXN_SOURCE_ICON[(section as { source: TxnSource }).source], 'inbox')} size={12} color={colors.accent} />
              </View>
              <Text style={styles.sectionHeaderText}>{TXN_SOURCE_LABEL[(section as { source: TxnSource }).source]}</Text>
              <Text style={styles.sectionHeaderCount}>{section.data.length}</Text>
            </View>
          ) : null}
          stickySectionHeadersEnabled={false}
          refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={[styles.scroll, { paddingBottom: listPad }]}
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
                      <Chip label="Personal" icon="user" onPress={() => setAllDest('personal')} />
                      {data!.sharedGroups.slice(0, 3).map(g => (
                        <Chip key={g.id} label={g.name} icon="users" maxWidth={140} onPress={() => setAllDest(g.id)} />
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
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]} onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}>
          {selectMode ? (
            /* Real buttons at PrimaryButton's 52pt, so the footer no longer grows
               4px when you leave selection mode (these were hand-rolled at 48). */
            <View style={styles.bulkBar}>
              <SecondaryButton label="Focus" icon="crosshair" onPress={focusSelected} disabled={selected.size === 0} style={styles.bulkBtn} />
              {hasGroups && (
                <SecondaryButton label="Group" icon="users" onPress={() => setBulkGroupSheet(true)} disabled={selected.size === 0} style={styles.bulkBtn} />
              )}
              <View style={styles.bulkSaveWrap}>
                <PrimaryButton
                  label={batchSaving ? 'Saving…' : `Save ${selected.size}`}
                  onPress={() => saveMany(pending.filter(r => selected.has(r.id)), 'Save selected?')}
                  disabled={selected.size === 0 || batchSaving}
                  loading={batchSaving}
                />
              </View>
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

      {/* Per-row destination. */}
      <ReviewDestSheet
        visible={destSheetFor !== null}
        onClose={() => setDestSheetFor(null)}
        groups={data?.sharedGroups ?? []}
        dest={destRow ? eff(destRow).dest : 'personal'}
        onSelect={(dest) => {
          // Drop the counterparty too: it belonged to the group being left.
          if (destSheetFor) patch(destSheetFor, { dest, counterparty: '' });
          setDestSheetFor(null);
        }}
      />

      {/* Per-row transfer counterparty. */}
      <CounterpartySheet
        visible={whoSheetFor !== null}
        onClose={() => setWhoSheetFor(null)}
        members={whoMembers}
        counterparty={whoRow ? eff(whoRow).counterparty : ''}
        inbound={whoRow ? eff(whoRow).direction === 'credit' : false}
        onSelect={(pid) => { if (whoSheetFor) patch(whoSheetFor, { counterparty: pid }); setWhoSheetFor(null); }}
      />

      {/* Per-row pay method — the SAME sheet Add uses, so the two can't drift. */}
      <PayMethodSheet
        visible={paySheetFor !== null}
        onClose={() => setPaySheetFor(null)}
        value={payRow ? eff(payRow).payMethod : ''}
        onChange={(m) => { if (paySheetFor) patch(paySheetFor, { payMethod: m }); }}
        onClear={() => { if (paySheetFor) patch(paySheetFor, { payMethod: '' }); }}
      />

      {/* Bulk group assign — shared, non-archived groups only (no Personal). */}
      <BulkGroupSheet
        visible={bulkGroupSheet}
        onClose={() => setBulkGroupSheet(false)}
        groups={data?.sharedGroups ?? []}
        count={selected.size}
        onSelect={assignBulkGroup}
      />

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
      <ReviewOverflowSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        filtersActive={hasFilters}
        savedViewCount={savedViews.length}
        onFilter={() => setFilterSheet(true)}
        onSelect={() => setSelectMode(true)}
        onSavedViews={() => setViewsSheet(true)}
        onSaveView={() => setSaveViewSheet(true)}
        onClearAll={handleClearAll}
      />

      {/* Saved views list. */}
      <SavedViewsSheet
        visible={viewsSheet}
        onClose={() => setViewsSheet(false)}
        views={savedViews}
        groups={data?.sharedGroups ?? []}
        membersByGroup={data?.groupMembers ?? {}}
        onApply={applyView}
        onDelete={removeView}
      />

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
  headerAction: { ...type.labelSemi, color: colors.accent },
  selectHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectAll: { ...type.labelSemi, color: colors.accent },
  stepLabel: { ...type.sectionLabel, color: colors.accent },
  intro: { ...type.label, color: colors.textMuted },
  assignAll: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: space.xs },
  assignAllLabel: { ...type.caption, color: colors.textMuted },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.md, paddingBottom: space.xs },
  sectionIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  sectionHeaderText: { ...type.sectionLabel, color: colors.textMuted, flex: 1 },
  sectionHeaderCount: { ...type.caption, color: colors.textSecondary, fontFamily: 'SpaceMono_400Regular' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: layout.screenPaddingH, paddingTop: space.sm, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  bulkBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  // SecondaryButton is width:100% by default; these shrink to their labels so the
  // Save button takes the remaining room.
  bulkBtn: { width: undefined, paddingHorizontal: space.md },
  bulkSaveWrap: { flex: 1 },
});

