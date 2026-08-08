import React from 'react';
import { StyleSheet } from 'react-native';
import { SheetModal } from '../../ui/SheetModal';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Divider } from '../../ui/Divider';
import { SecondaryButton } from '../../ui/SecondaryButton';
import { space } from '../../tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Shown as the Filter row's value when a filter is active. */
  filtersActive: boolean;
  savedViewCount: number;
  onFilter: () => void;
  onSelect: () => void;
  onSavedViews: () => void;
  onSaveView: () => void;
  onClearAll: () => void;
};

/**
 * The Review header's ⋯ menu: filter, enter selection mode, saved views, and the
 * destructive "clear all".
 *
 * Every action closes the sheet before it runs — these all either open another
 * overlay or raise an Alert, and two stacked RN `<Modal>`s break keyboard handling
 * (see `SheetModal`'s own note). Doing it here rather than at each call site means a
 * caller can't forget.
 */
export function ReviewOverflowSheet({
  visible, onClose, filtersActive, savedViewCount,
  onFilter, onSelect, onSavedViews, onSaveView, onClearAll,
}: Props) {
  const then = (fn: () => void) => () => { onClose(); fn(); };

  return (
    <SheetModal visible={visible} onClose={onClose} title="Review options" scroll={false}>
      <Card clip>
        <ListRow icon="filter" title="Filter" value={filtersActive ? 'On' : undefined} onPress={then(onFilter)} />
        <Divider indent="text" />
        <ListRow icon="check-square" title="Select" onPress={then(onSelect)} />
        <Divider indent="text" />
        <ListRow icon="bookmark" title="Saved views" value={savedViewCount ? String(savedViewCount) : undefined} onPress={then(onSavedViews)} />
        <Divider indent="text" />
        <ListRow icon="save" title="Save current view" onPress={then(onSaveView)} />
      </Card>
      {/* Destructive, so it sits outside the card and reads as a separate decision. */}
      <SecondaryButton label="Clear all" icon="trash-2" danger onPress={then(onClearAll)} style={styles.danger} />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  danger: { marginTop: space.md },
});
