import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SheetModal } from '../../ui/SheetModal';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Divider } from '../../ui/Divider';
import { IconCircle } from '../../ui/IconCircle';
import { SectionHeader } from '../../ui/SectionHeader';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { MemberAvatar } from '../MemberAvatar';
import { asFeather } from '../../../constants/palette';
import { StyleSheet } from 'react-native';
import { colors, layout, space } from '../../tokens';
import type { BudgetGroup } from '../../../db/queries/groups';

/** Personal plus your three most-used groups sit in the first block. */
const USUAL_COUNT = 4;

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Already ordered — Personal first, then most-used lately (`getGroupsByRecentUse`). */
  groups: BudgetGroup[];
  selectedId: string;
  onSelect: (id: string) => void;
  /**
   * People you can spend with, with no group involved — tick one or more.
   *
   * Confirmed with the button, not on each tap: it is a set, and closing the sheet on
   * the first tick made "me, Aarav and Meera" impossible. What is made underneath (a
   * pair group for one, a hidden group for several) is never shown as a group — see
   * `getOrCreatePeopleSetGroup`.
   */
  people?: Array<{ id: string; name: string; avatar_color: string }>;
  onSelectPeople?: (personIds: string[]) => void;
  /** Who the current destination is already "with", so their rows start ticked. */
  selectedPersonIds?: string[];
  /** Tint for the selected check — the screen's kind colour, so the sheet agrees
   *  with the form behind it instead of hardcoding the expense accent. */
  accent?: string;
};

/**
 * The destination picker behind the Add screen's `ContextPill`.
 *
 * Every group is listed — a sheet scrolls, so nothing is hidden — but the ones you use most come
 * first, and the top few sit in their own block so the usual answer is one glance away. Rows are full `layout.rowMinHeight`
 * so they can actually be hit — the pills this replaces were ~32pt with no
 * hitSlop, well under AGENTS.md §6.
 */
export function DestinationSheet({
  visible, onClose, groups, selectedId, onSelect,
  people = [], onSelectPeople, selectedPersonIds = [], accent = colors.accent,
}: Props) {
  // A draft: ticking only edits this until the button confirms it.
  const [picked, setPicked] = useState<string[]>(selectedPersonIds);
  const selectedKey = selectedPersonIds.join('|');
  useEffect(() => { if (visible) setPicked(selectedPersonIds); }, [visible, selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const unchanged = picked.length === selectedPersonIds.length && picked.every(id => selectedPersonIds.includes(id));
  const names = people.filter(p => picked.includes(p.id)).map(p => p.name.split(' ')[0]);

  const renderGroups = (list: BudgetGroup[]) => (
    <Card clip>
      {list.map((g, i) => {
        const active = g.id === selectedId;
        return (
          <View key={g.id}>
            {i > 0 && <Divider indent="text" />}
            <ListRow
              leading={<IconCircle icon={asFeather(g.icon, 'layers')} size={layout.iconCircle} color={g.color} />}
              title={g.name}
              // Counted, not stored: `is_shared` is never updated, so it read
              // "Shared" only on groups you RECEIVED and never on ones you
              // shared yourself. See `MEMBER_COUNT` in queries/groups.
              subtitle={g.is_personal === 1
                ? 'Only you'
                : (g.member_count ?? 0) > 1 ? `Shared with ${(g.member_count ?? 1) - 1}` : undefined}
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
  );

  return (
    <SheetModal visible={visible} onClose={onClose} title="Where does this go?">
      {renderGroups(groups.slice(0, USUAL_COUNT))}
      {groups.length > USUAL_COUNT && (
        <>
          <SectionHeader title="More groups" />
          {renderGroups(groups.slice(USUAL_COUNT))}
        </>
      )}

      {/*
        People, under the groups and labelled, because "just the two of us" is a
        different question from "which group". Tick one or more: this is an expense
        with those people, not a group, and it never shows up in the Groups list.
      */}
      {people.length > 0 && onSelectPeople && (
        <>
          <SectionHeader title="Or just with people" />
          <Card clip>
            {people.map((p, i) => {
              const on = picked.includes(p.id);
              return (
                <View key={p.id}>
                  {i > 0 && <Divider indent="text" />}
                  <ListRow
                    leading={<MemberAvatar name={p.name} color={p.avatar_color} size={layout.iconCircle} />}
                    title={p.name}
                    value={<Feather name={on ? 'check-square' : 'square'} size={20} color={on ? accent : colors.textMuted} />}
                    chevron={false}
                    selected={on}
                    onPress={() => toggle(p.id)}
                    accessibilityLabel={`Split with ${p.name}`}
                  />
                </View>
              );
            })}
          </Card>
          {picked.length > 0 && !unchanged && (
            <View style={styles.confirm}>
              <PrimaryButton
                label={`Split with ${names.join(', ')}`}
                onPress={() => { onClose(); onSelectPeople(picked); }}
              />
            </View>
          )}
        </>
      )}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  confirm: { marginTop: space.md },
});
