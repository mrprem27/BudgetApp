import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SheetModal } from '../../ui/SheetModal';
import { SectionHeader } from '../../ui/SectionHeader';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { PersonPicker } from '../PersonPicker';
import { GroupGrid, type GroupTile } from '../GroupGrid';
import { asFeather } from '../../../constants/palette';
import { StyleSheet } from 'react-native';
import { colors, space } from '../../tokens';
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
 * The destination picker behind the Add screen's header.
 *
 * Every group is listed as a tile (`GroupGrid`, `U-23`) — a sheet scrolls, so nothing is hidden —
 * but the ones you use most come first, and the top few sit in their own block so the usual answer
 * is one glance away. "Just with people" below is the shared people grid (`PersonPicker`, `U-22`).
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

  // Counted, not stored: `is_shared` is never updated, so it read "Shared" only on groups you
  // RECEIVED and never on ones you shared yourself. See `MEMBER_COUNT` in queries/groups.
  const tiles = (list: BudgetGroup[]): GroupTile[] => list.map(g => ({
    id: g.id,
    name: g.name,
    icon: asFeather(g.icon, 'layers'),
    color: g.color,
    sub: g.is_personal === 1 ? 'Only you' : (g.member_count ?? 0) > 1 ? `With ${(g.member_count ?? 1) - 1}` : undefined,
  }));
  const pick = (id: string) => { onClose(); if (id !== selectedId) onSelect(id); };
  const renderGroups = (list: BudgetGroup[]) => (
    <GroupGrid items={tiles(list)} selectedId={selectedId} onSelect={pick} accent={accent} />
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
          <PersonPicker persons={people} selected={picked} onToggle={toggle} />
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
