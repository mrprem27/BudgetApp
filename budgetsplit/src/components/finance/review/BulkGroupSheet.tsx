import React from 'react';
import { SheetModal } from '../../ui/SheetModal';
import { EmptyState } from '../../ui/EmptyState';
import { DestOption } from './DestOption';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Shared, non-archived groups. No Personal row — this is "assign to a group". */
  groups: { id: string; name: string }[];
  /** How many rows are selected, for the title. */
  count: number;
  onSelect: (groupId: string) => void;
};

/**
 * Assign every selected pending row to one group.
 *
 * No Personal option on purpose: rows default to personal, so this sheet only exists
 * to move them *into* a shared group. Clearing back to personal is what the per-row
 * destination sheet is for.
 */
export function BulkGroupSheet({ visible, onClose, groups, count, onSelect }: Props) {
  return (
    <SheetModal visible={visible} onClose={onClose} title={`Assign ${count} to a group`} scroll={false}>
      {groups.length === 0 ? (
        <EmptyState
          icon="users"
          title="No shared groups"
          body="Create a group with someone in it and you can assign imported transactions to it in bulk."
        />
      ) : (
        groups.map(g => (
          <DestOption key={g.id} label={g.name} icon="users" active={false} onPress={() => onSelect(g.id)} />
        ))
      )}
    </SheetModal>
  );
}
