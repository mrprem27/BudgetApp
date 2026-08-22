import React from 'react';
import { SectionList } from 'react-native';
import { reviewStyles as styles } from './reviewStyles';
import { ReviewRowCard } from './ReviewRowCard';
import { ReviewSourceHeader } from './ReviewSourceTabs';
import { ReviewListHeader } from './ReviewListHeader';
import { AppRefreshControl } from '../../ui/AppRefreshControl';
import type { PendingTxn } from '../../../db/queries/pending';
import type { Person } from '../../../db/queries/persons';
import type { TxnSource } from '../../../constants/enums';
import type { RowEdit, SplitState } from '../../../lib/reviewCommit';

type Section = { source: TxnSource; data: PendingTxn[] };

type Props = {
  sections: Section[];
  /** Show per-source headers only when more than one source is present. */
  multiSource: boolean;
  sharedGroups: Array<{ id: string; name: string }>;
  groupMembers: Record<string, Person[]>;
  hasGroups: boolean;

  selectMode: boolean;
  selected: Set<string>;
  allVisibleSelected: boolean;
  rowCount: number;
  savingId: string | null;
  batchSaving: boolean;

  refreshing: boolean;
  onRefresh: () => void;
  /** Space for the sticky footer, measured by the screen. */
  listPad: number;

  eff: (row: PendingTxn) => RowEdit;
  splitState: (row: PendingTxn) => SplitState;

  /*
   * Mirrors `ReviewRowCard`'s own signatures exactly rather than restating them
   * in a nicer shape. This component only forwards them, and a "tidier" type here
   * would be a second definition to keep in step for no gain.
   *
   * Note the amount is deliberately two handlers: per-keystroke local state, and
   * a flush on blur — see the reasoning on `ReviewRowCard`.
   */
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onAmountChange: (id: string, text: string) => void;
  onAmountBlur: (id: string, text: string) => void;
  onPatch: (id: string, patch: Partial<RowEdit>) => void;
  onSplitChange: (row: PendingTxn, patch: Partial<SplitState>) => void;
  onOpenCategory: (id: string) => void;
  onOpenDest: (id: string) => void;
  onOpenCounterparty: (id: string) => void;
  onOpenPay: (id: string) => void;
  onConfirm: (row: PendingTxn) => void;
  onDiscard: (row: PendingTxn) => void;
};

/**
 * The Review inbox list.
 *
 * Extracted from `review.tsx` because that screen sat at its ratchet ceiling and
 * the ratchet's own comment named this as the move to make. It is a pure view:
 * every piece of state and every handler still lives on the screen, so this is a
 * relocation, not a redesign — the existing Review tests must pass untouched.
 *
 * `stickySectionHeadersEnabled={false}` is deliberate and load-bearing: these
 * headers have no background, so a stuck one sits transparently over the rows
 * scrolling underneath it (AGENTS §12).
 */
export function ReviewList({
  sections, multiSource, sharedGroups, groupMembers, hasGroups,
  selectMode, selected, allVisibleSelected, rowCount, savingId, batchSaving,
  refreshing, onRefresh, listPad, eff, splitState,
  onToggleSelect, onToggleSelectAll, onAmountChange, onAmountBlur, onPatch,
  onSplitChange, onOpenCategory, onOpenDest, onOpenCounterparty, onOpenPay,
  onConfirm, onDiscard,
}: Props) {
  return (
    <SectionList
      sections={sections}
      keyExtractor={r => r.id}
      automaticallyAdjustKeyboardInsets
      renderItem={({ item }) => (
        <ReviewRowCard
          row={item}
          v={eff(item)}
          st={splitState(item)}
          sharedGroups={sharedGroups}
          groupMembers={groupMembers}
          hasGroups={hasGroups}
          selectMode={selectMode}
          checked={selected.has(item.id)}
          saving={savingId === item.id}
          batchSaving={batchSaving}
          onToggleSelect={onToggleSelect}
          onAmountChange={onAmountChange}
          onAmountBlur={onAmountBlur}
          onPatch={onPatch}
          onSplitChange={onSplitChange}
          onOpenCategory={onOpenCategory}
          onOpenDest={onOpenDest}
          onOpenCounterparty={onOpenCounterparty}
          onOpenPay={onOpenPay}
          onConfirm={onConfirm}
          onDiscard={onDiscard}
        />
      )}
      renderSectionHeader={({ section }) => multiSource
        ? <ReviewSourceHeader source={(section as Section).source} count={section.data.length} />
        : null}
      stickySectionHeadersEnabled={false}
      refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={[styles.scroll, { paddingBottom: listPad }]}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={12}
      windowSize={8}
      ListHeaderComponent={
        <ReviewListHeader
          selectMode={selectMode}
          selectedCount={selected.size}
          allSelected={allVisibleSelected}
          onToggleSelectAll={onToggleSelectAll}
          rowCount={rowCount}
          hasGroups={hasGroups}
        />
      }
    />
  );
}
