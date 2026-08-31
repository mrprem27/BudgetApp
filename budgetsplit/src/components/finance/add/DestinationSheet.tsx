import React from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SheetModal } from '../../ui/SheetModal';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Divider } from '../../ui/Divider';
import { IconCircle } from '../../ui/IconCircle';
import { SectionHeader } from '../../ui/SectionHeader';
import { MemberAvatar } from '../MemberAvatar';
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
  /**
   * People you can split with directly, without a group.
   *
   * Picking one creates their two-person group on first use — see
   * `getOrCreatePairGroup`. That is the only way a 1:1 split can travel at all,
   * because only shared groups sync, so before this the most ordinary thing
   * anybody does with a splitting app went into Personal and stopped there.
   */
  people?: Array<{ id: string; name: string; avatar_color: string }>;
  onSelectPerson?: (personId: string) => void;
  /** The pair group currently selected, so their row shows the check. */
  selectedPersonId?: string | null;
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
export function DestinationSheet({
  visible, onClose, groups, selectedId, onSelect,
  people = [], onSelectPerson, selectedPersonId, accent = colors.accent,
}: Props) {
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

      {/*
        People, under the groups and labelled, because "just the two of us" is a
        different question from "which group". Their pair group is made on the
        first expense, so this list is contacts rather than a second list of
        groups you never created.
      */}
      {people.length > 0 && onSelectPerson && (
        <>
          <SectionHeader title="Just with someone" />
          <Card clip>
            {people.map((p, i) => {
              const active = p.id === selectedPersonId;
              return (
                <View key={p.id}>
                  {i > 0 && <Divider indent="text" />}
                  <ListRow
                    leading={<MemberAvatar name={p.name} color={p.avatar_color} size={layout.iconCircle} />}
                    title={p.name}
                    value={active ? <Feather name="check" size={18} color={accent} /> : undefined}
                    chevron={false}
                    selected={active}
                    onPress={() => { onClose(); if (!active) onSelectPerson(p.id); }}
                    accessibilityLabel={`Split with ${p.name}`}
                  />
                </View>
              );
            })}
          </Card>
        </>
      )}
    </SheetModal>
  );
}
