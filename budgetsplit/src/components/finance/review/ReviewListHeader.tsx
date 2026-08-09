import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { reviewStyles as styles } from './reviewStyles';

type Props = {
  selectMode: boolean;
  selectedCount: number;
  /** True when every row on the visible tab is already selected. */
  allSelected: boolean;
  onToggleSelectAll: () => void;
  /** Rows on the visible tab, which is what the copy counts. */
  rowCount: number;
  hasGroups: boolean;
};

/**
 * The block above the first row: either the selection counter, or what to do here.
 *
 * The "All to:" chip row that used to live here rewrote every visible row's group on one tap
 * — nothing selected, nothing to confirm, and no undo beyond editing each row back. Bulk edits
 * now go through Select → Actions, so this only has to point at that.
 */
export function ReviewListHeader({
  selectMode, selectedCount, allSelected, onToggleSelectAll, rowCount, hasGroups,
}: Props) {
  return (
    <View style={styles.headerBlock}>
      {selectMode ? (
        <View style={styles.selectHeader}>
          <Text style={styles.stepLabel}>{selectedCount} selected</Text>
          <TouchableOpacity onPress={onToggleSelectAll} hitSlop={6} accessibilityRole="button">
            <Text style={styles.selectAll}>{allSelected ? 'Clear' : 'Select all'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={styles.stepLabel}>To review</Text>
          <Text style={styles.intro}>
            {rowCount} transaction{rowCount === 1 ? '' : 's'}. Set each one, then Confirm to save.
            {hasGroups ? ' To change several at once, use Select.' : ''} Changes are kept as you go.
          </Text>
        </>
      )}
    </View>
  );
}
