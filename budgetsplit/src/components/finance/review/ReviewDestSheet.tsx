import React from 'react';
import { SheetModal } from '../../ui/SheetModal';
import { DestOption } from './DestOption';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Shared, non-archived groups. Personal is a sentinel, not one of these. */
  groups: { id: string; name: string }[];
  /** `'personal'` or a group id. */
  dest: string;
  onSelect: (dest: string) => void;
};

/**
 * "Personal or group" for one pending row.
 *
 * Deliberately *not* Add's `DestinationSheet`, even though both pick a destination.
 * Review's `dest` is `'personal' | groupId` — a sentinel plus the **shared** groups
 * only, because a pending row can only be assigned to an active shared group — while
 * Add picks among real `BudgetGroup` rows where Personal is itself a group. Forcing
 * one component to serve both would mean faking a `BudgetGroup` for the sentinel.
 */
export function ReviewDestSheet({ visible, onClose, groups, dest, onSelect }: Props) {
  return (
    <SheetModal visible={visible} onClose={onClose} title="Personal or group" scroll={false}>
      <DestOption
        label="Personal"
        icon="user"
        active={dest === 'personal'}
        onPress={() => onSelect('personal')}
      />
      {groups.map(g => (
        <DestOption
          key={g.id}
          label={g.name}
          icon="users"
          active={dest === g.id}
          onPress={() => onSelect(g.id)}
        />
      ))}
    </SheetModal>
  );
}
