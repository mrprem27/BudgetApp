import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SheetModal } from '../../ui/SheetModal';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Divider } from '../../ui/Divider';
import { SecondaryButton } from '../../ui/SecondaryButton';
import { colors, space, type } from '../../tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** How many rows the action will land on. Named in every label, never implied. */
  count: number;
  hasGroups: boolean;
  onGroup: () => void;
  onCategory: () => void;
  onPayMethod: () => void;
  onKind: () => void;
  onFocus: () => void;
  onDelete: () => void;
};

/**
 * Everything you can do to a selection, in one list.
 *
 * This replaced two things that fought each other: a three-button bulk bar that only
 * offered Focus and Group, and an "All to:" chip row at the top of the list that silently
 * reassigned **every visible row** with one tap — no selection, no confirmation, no undo
 * beyond editing each row back. A destructive-by-default control sitting above the content
 * it rewrites is the wrong shape; choosing rows first and then choosing an action is the
 * right one, and it scales to more actions without growing the footer.
 *
 * Every row states the count, so the sheet can never be read as "do this to the one I was
 * looking at". Actions that need a value open their own picker — the same pickers a single
 * row uses, so bulk and single editing cannot drift.
 *
 * Closes before running, like `ReviewOverflowSheet`: each action opens another overlay or
 * raises an Alert, and two stacked RN `<Modal>`s break keyboard handling.
 */
export function BulkActionsSheet({
  visible, onClose, count, hasGroups,
  onGroup, onCategory, onPayMethod, onKind, onFocus, onDelete,
}: Props) {
  const then = (fn: () => void) => () => { onClose(); fn(); };
  const n = `${count} transaction${count === 1 ? '' : 's'}`;

  return (
    <SheetModal visible={visible} onClose={onClose} title={`${count} selected`} scroll={false}>
      <Card clip>
        {hasGroups && (
          <>
            <ListRow icon="users" title="Assign to group" value={n} onPress={then(onGroup)} />
            <Divider indent="text" />
          </>
        )}
        <ListRow icon="tag" title="Set category" value={n} onPress={then(onCategory)} />
        <Divider indent="text" />
        <ListRow icon="credit-card" title="Set payment method" value={n} onPress={then(onPayMethod)} />
        <Divider indent="text" />
        <ListRow icon="repeat" title="Change kind" value={n} onPress={then(onKind)} />
        <Divider indent="text" />
        {/* Not an edit — it narrows the screen to these rows so the rest stops competing. */}
        <ListRow icon="crosshair" title="Focus on these" value="Hide the rest" onPress={then(onFocus)} />
      </Card>

      <View style={styles.foot}>
        <Text style={styles.note}>
          Edits apply straight away and are kept as you go. Nothing leaves Review until you
          save.
        </Text>
        <SecondaryButton label={`Discard ${count}`} icon="trash-2" danger onPress={then(onDelete)} />
      </View>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  foot: { marginTop: space.md, gap: space.sm },
  note: { ...type.caption, color: colors.textMuted, lineHeight: 16 },
});
