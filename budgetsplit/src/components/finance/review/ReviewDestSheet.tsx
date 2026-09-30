import React from 'react';
import { SheetModal } from '../../ui/SheetModal';
import { GroupGrid } from '../GroupGrid';
import { asFeather } from '../../../constants/palette';
import { colors } from '../../tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Shared, non-archived groups. Personal is a sentinel, not one of these. */
  groups: { id: string; name: string; icon?: string; color?: string }[];
  /** `'personal'` or a group id. */
  dest: string;
  onSelect: (dest: string) => void;
};

/**
 * "Personal or group" for one pending row, as the same tiles Add uses (`GroupGrid`, `U-23`).
 *
 * Not Add's `DestinationSheet`: Review's `dest` is `'personal' | groupId` — a sentinel plus the
 * **shared** groups only, because a pending row can only be assigned to an active shared group —
 * while Add picks among real `BudgetGroup` rows where Personal is itself a group. `GroupGrid` takes
 * plain items, so the two sheets share the control without faking a group for the sentinel.
 */
export function ReviewDestSheet({ visible, onClose, groups, dest, onSelect }: Props) {
  const items = [
    { id: 'personal', name: 'Personal', icon: 'user' as const, color: colors.accent, sub: 'Only you' },
    ...groups.map(g => ({ id: g.id, name: g.name, icon: asFeather(g.icon ?? 'users', 'users'), color: g.color ?? colors.accent })),
  ];
  return (
    <SheetModal visible={visible} onClose={onClose} title="Personal or group">
      <GroupGrid items={items} selectedId={dest} onSelect={onSelect} />
    </SheetModal>
  );
}
