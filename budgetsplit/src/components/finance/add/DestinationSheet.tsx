import React from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SheetModal } from '../../ui/SheetModal';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Divider } from '../../ui/Divider';
import { IconCircle } from '../../ui/IconCircle';
import { asFeather } from '../../../constants/palette';
import { colors, layout } from '../../tokens';
import type { BudgetGroup } from '../../../db/queries/groups';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Already ordered — Personal first, then recency (`getGroupsByRecentUse`). */
  groups: BudgetGroup[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** Tint for the selected check — the screen's kind colour, so the sheet agrees
   *  with the form behind it instead of hardcoding the expense accent. */
  accent?: string;
};

/**
 * The destination picker behind the Add screen's `ContextPill`.
 *
 * Every group is listed, not the first three with a "More" escape hatch: a sheet
 * scrolls, so there's no reason to truncate. Rows are full `layout.rowMinHeight`
 * so they can actually be hit — the pills this replaces were ~32pt with no
 * hitSlop, well under AGENTS.md §6.
 */
export function DestinationSheet({ visible, onClose, groups, selectedId, onSelect, accent = colors.accent }: Props) {
  return (
    <SheetModal visible={visible} onClose={onClose} title="Where does this go?">
      <Card clip>
        {groups.map((g, i) => {
          const active = g.id === selectedId;
          return (
            <View key={g.id}>
              {i > 0 && <Divider indent="text" />}
              <ListRow
                leading={<IconCircle icon={asFeather(g.icon, 'layers')} size={layout.iconCircle} color={g.color} />}
                title={g.name}
                subtitle={g.is_personal === 1 ? 'Only you' : g.is_shared === 1 ? 'Shared' : undefined}
                value={active ? <Feather name="check" size={18} color={accent} /> : undefined}
                chevron={false}
                selected={active}
                onPress={() => { onClose(); if (!active) onSelect(g.id); }}
                accessibilityLabel={g.name}
              />
            </View>
          );
        })}
      </Card>
    </SheetModal>
  );
}
