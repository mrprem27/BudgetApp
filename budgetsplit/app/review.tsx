import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, SectionList, TouchableOpacity, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, space, layout } from '../src/theme';
import { reviewStyles as styles } from '../src/components/finance/review/reviewStyles';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { SheetModal } from '../src/components/ui/SheetModal';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { SecondaryButton } from '../src/components/ui/SecondaryButton';
import { Banner } from '../src/components/ui/Banner';
import { ReviewSourceTabs, ReviewSourceHeader } from '../src/components/finance/review/ReviewSourceTabs';
import { ReviewList } from '../src/components/finance/review/ReviewList';
import { useReviewCommit } from '../src/hooks/useReviewCommit';
import { SkeletonCard } from '../src/components/ui/Skeleton';
import { AppRefreshControl } from '../src/components/ui/AppRefreshControl';
import { ReviewRowSheets } from '../src/components/finance/review/ReviewRowSheets';
import type { ParsedDirection } from '../src/lib/importParse';
import {
  effectiveRow, effectiveSplit, snapshotRow, planCommit as planCommitPure, txnInputFromPlan,
  type RowEdit, type SplitState, type CommitPlan, type ReviewContext,
} from '../src/lib/reviewCommit';
import { FilterForm } from '../src/components/finance/review/FilterForm';
import { SaveViewForm } from '../src/components/finance/review/SaveViewForm';
import { ReviewRowCard } from '../src/components/finance/review/ReviewRowCard';
import { BulkGroupSheet } from '../src/components/finance/review/BulkGroupSheet';
import { ReviewBulkSheets } from '../src/components/finance/review/ReviewBulkSheets';
import { ReviewOverflowSheet } from '../src/components/finance/review/ReviewOverflowSheet';
import { SavedViewsSheet } from '../src/components/finance/review/SavedViewsSheet';
import {
  getPending, deletePending, updatePendingDraft, restorePending,
  type PendingTxn, type PendingDraft,
} from '../src/db/queries/pending';
import { insertTxnRows, softDeleteTxn, findDuplicatesAmong } from '../src/db/queries/transactions';
import { confirmDuplicates } from '../src/lib/confirm';
import { convertToRecurring } from '../src/db/queries/recurring';
import { getMe, getGroupMembers, type Person } from '../src/db/queries/persons';
import { getAllGroups } from '../src/db/queries/groups';
import { getCategoriesByFrequency, type Category } from '../src/db/queries/categories';
import { parseToPaise } from '../src/lib/money';
import { recordCorrection } from '../src/lib/smartCategoryLearn';
import { detectRecurringCandidates, toRecurRows, type RecurringCandidate } from '../src/lib/recurringSuggest';
import { RecurringSuggestionBanner } from '../src/components/finance/review/RecurringSuggestionBanner';
import { RecurringSuggestionsSheet } from '../src/components/finance/review/RecurringSuggestionsSheet';
import { useFeatureFlags } from '../src/components/system/FeatureFlagsProvider';
import {
  type ReviewFilters, DEFAULT_FILTERS,
  filtersActive, deriveWorkingSet, isSimilarMerchant,
  groupBySource, presentSourcesOf, sourceSections,
} from '../src/lib/reviewFilter';
import { type SavedView, loadViews, upsertView, deleteView, makeViewId } from '../src/lib/reviewViews';
import { useScreenData } from '../src/hooks/useScreenData';
import { useContentInset } from '../src/hooks/useContentInset';
import { useDataRefresh } from '../src/components/system/DataRefreshProvider';
import { useToast } from '../src/components/system/Toast';
import { haptic } from '../src/lib/haptics';
import { saveFailureMessage } from '../src/lib/dbErrors';
import {
  type TxnSource, TXN_SOURCE_LABEL,
} from '../src/constants/enums';

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
  const { showUndo } = useToast();
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
  // Just "is the action list open" — which picker is showing is `ReviewBulkSheets`' business.
  const [bulkSheet, setBulkSheet] = useState(false);
  /** Which source tab is showing. Null = all of them, with headers between. */
  const [sourceTab, setSourceTab] = useState<TxnSource | null>(null);
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
      getCategoriesByFrequency(db, personalId, 'expense'),
      getCategoriesByFrequency(db, personalId, 'income'),
      getCategoriesByFrequency(db, personalId, 'transfer'),
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
  const { visibleRows, focusActive, hasFilters, narrowed, distinctCats } = deriveWorkingSet(pending, focusIds, filters, filterRowOf, row => eff(row).category);

  // One pass, reused by the tab strip, its counts and the sections — see `groupBySource`.
  // A tab whose source was just cleared falls back to All rather than stranding you.
  const bySource = useMemo(() => groupBySource(visibleRows), [visibleRows]);
  const presentSources = useMemo(() => presentSourcesOf(bySource), [bySource]);
  const activeSource = sourceTab && presentSources.includes(sourceTab) ? sourceTab : null;
  const tabRows = useMemo(() => (activeSource ? bySource.get(activeSource) ?? [] : visibleRows), [activeSource, bySource, visibleRows]);
  const countOf = useCallback((src: TxnSource | null) => (src ? bySource.get(src)?.length ?? 0 : visibleRows.length), [bySource, visibleRows.length]);

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

  /** Loops `patch` rather than duplicating its RowEdit→PendingDraft mapping. */
  function patchMany(p: Partial<RowEdit>) {
    const ids = [...selected];
    for (const id of ids) patch(id, p);
    haptic.success();
    return ids.length;
  }

  function patchSplit(row: PendingTxn, p: Partial<SplitState>) {
    const next = { ...splitState(row), ...p };
    setSplits(prev => ({ ...prev, [row.id]: next }));
    updatePendingDraft(db, row.id, { split_draft: JSON.stringify(next) }).catch(() => {});
  }

  /** Set a category, teach the shared learner, and offer to apply it to lookalike rows.
   *  Never silent — the offer is always a prompt. */
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

  /** Scoped to the batch just committed, not a lifetime scan. Never fires for typed rows —
   *  there is no pattern to spot that the user did not just enter by hand. */
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

  // Every write Review performs — commit, batch commit, discard, and the undo for
  // each — lives in its own hook. This screen still owns the state; the hook owns
  // the transactions.
  const {
    confirmRow, saveMany, discard, deleteRow, deleteSelected, handleClearAll,
  } = useReviewCommit({
    db, pending, selected, savingId, setSavingId, BATCH,
    planCommit, eff, splitState, refresh, reload, showUndo, exitSelect,
    checkRecurringSuggestions,
  });


  // ---- selection & focus ----
  function exitSelect() { setSelectMode(false); setSelected(new Set()); }
  function toggleSelect(id: string) {
    haptic.selection();
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  // Scoped to the visible tab, not the whole inbox: "Select all" has to mean the rows you can
  // see, or it silently reaches into sources you are not looking at.
  const allVisibleSelected = tabRows.length > 0 && tabRows.every(r => selected.has(r.id));
  function toggleSelectAll() {
    haptic.selection();
    setSelected(allVisibleSelected ? new Set() : new Set(tabRows.map(r => r.id)));
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

  /** Apply a saved view: filter, bulk-assign to its group, mark its payer active. */
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

  // `ReviewRowCard` lives at MODULE scope. Declaring it inside this component would create a
  // new component *type* every render, remounting the subtree and dropping keyboard focus
  // mid-digit while typing an amount. See the note in that file before moving it.

  // Resolved once so a sheet never re-finds its own row (the inline versions did
  // `pending.find(...)!` up to three times in one element).
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

  // Headers only earn their place on the All tab; on a single source they repeat the tab.
  const sections = useMemo(() => sourceSections(activeSource, bySource), [activeSource, bySource]);
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
          text={activeView ? activeView.name : focusActive ? 'Focus' : 'Filtered'}
          // Kept out of `text` on purpose — appended into one string, a long
          // saved-view name pushes exactly this off the end, which is the one
          // thing being scanned. Same fix as the review source tabs' `badge`.
          badge={`${visibleRows.length} of ${pending.length}${activePayerName ? ` · paid by ${activePayerName}` : ''}`}
          actionLabel="Show all"
          onAction={exitFocus}
        />
      )}

      {!loading && !error && (
        <ReviewSourceTabs
          sources={presentSources}
          active={activeSource}
          onChange={setSourceTab}
          countOf={countOf}
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
          onAction={() => { setSourceTab(null); exitFocus(); }}
        />
      ) : (
        <ReviewList
          sections={sections}
          multiSource={multiSource}
          sharedGroups={data?.sharedGroups ?? []}
          groupMembers={data?.groupMembers ?? {}}
          hasGroups={hasGroups}
          selectMode={selectMode}
          selected={selected}
          allVisibleSelected={allVisibleSelected}
          rowCount={tabRows.length}
          savingId={savingId}
          batchSaving={batchSaving}
          refreshing={refreshing}
          onRefresh={onRefresh}
          listPad={listPad}
          eff={eff}
          splitState={splitState}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
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

      {/* Sticky footer — one CTA normally, Actions + Save while selecting. */}
      {!loading && pending.length > 0 && !emptyFiltered && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]} onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}>
          {selectMode ? (
            /* Two buttons, not four: every bulk edit moved into the Actions list, so adding
               one no longer means finding footer room. */
            <View style={styles.bulkBar}>
              <SecondaryButton
                label="Actions"
                icon="sliders"
                onPress={() => setBulkSheet(true)}
                disabled={selected.size === 0}
                style={styles.bulkBtn}
              />
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
              label={batchSaving ? 'Saving…' : `Save ${tabRows.length}${activeSource ? ` ${TXN_SOURCE_LABEL[activeSource].toLowerCase()}` : ''}`}
              onPress={() => saveMany(tabRows, narrowed || activeSource ? 'Save these?' : 'Save all?')}
              loading={batchSaving}
            />
          )}
        </View>
      )}

      {/* Bulk actions and their pickers — one unit, so this screen only tracks "open". */}
      <ReviewBulkSheets
        visible={bulkSheet}
        onClose={() => setBulkSheet(false)}
        count={selected.size}
        hasGroups={hasGroups}
        kinds={[...new Set(pending.filter(r => selected.has(r.id)).map(r => eff(r).kind))]}
        expenseCats={data?.expenseCats ?? []}
        incomeCats={data?.incomeCats ?? []}
        transferCats={data?.transferCats ?? []}
        onGroup={() => setBulkGroupSheet(true)}
        onFocus={focusSelected}
        onDelete={deleteSelected}
        onApply={patchMany}
      />

      {/* The four per-row editors, mounted once for the list. */}
      <ReviewRowSheets
        catRow={catPickerRow ? { category: eff(catPickerRow).category, kind: catPickerKind } : null}
        categories={catList}
        onCategory={(name) => { if (catPickerRow) applyCategory(catPickerRow, name); setCatPickerFor(null); }}
        onCloseCategory={() => setCatPickerFor(null)}
        destOpen={destSheetFor !== null}
        dest={destRow ? eff(destRow).dest : 'personal'}
        groups={data?.sharedGroups ?? []}
        // Drop the counterparty too: it belonged to the group being left.
        onDest={(dest) => { if (destSheetFor) patch(destSheetFor, { dest, counterparty: '' }); setDestSheetFor(null); }}
        onCloseDest={() => setDestSheetFor(null)}
        whoOpen={whoSheetFor !== null}
        whoMembers={whoMembers}
        counterparty={whoRow ? eff(whoRow).counterparty : ''}
        inbound={whoRow ? eff(whoRow).direction === 'credit' : false}
        onCounterparty={(pid) => { if (whoSheetFor) patch(whoSheetFor, { counterparty: pid }); setWhoSheetFor(null); }}
        onCloseWho={() => setWhoSheetFor(null)}
        payOpen={paySheetFor !== null}
        payMethod={payRow ? eff(payRow).payMethod : ''}
        onPayMethod={(m) => { if (paySheetFor) patch(paySheetFor, { payMethod: m }); }}
        onClearPay={() => { if (paySheetFor) patch(paySheetFor, { payMethod: '' }); }}
        onClosePay={() => setPaySheetFor(null)}
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
      <SheetModal visible={saveViewSheet} onClose={() => setSaveViewSheet(false)} title="Save view">
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
