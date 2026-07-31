import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, space, radius, layout } from '../../tokens';
import { asFeather } from '../../../constants/palette';
import { AvatarStack } from '../AvatarStack';
import type { BudgetGroup } from '../../../db/queries/groups';
import type { Person } from '../../../db/queries/persons';
import { alpha } from '../../../theme';

type Props = {
  group: BudgetGroup;
  members: Person[];
};

/**
 * Group detail identity strip — a slim visual banner beneath the ScreenHeader.
 *
 * The screen header already carries the group name + subtitle ("3 members ·
 * ₹12k this month"), so this strip drops both to avoid the previous
 * duplicate-title / duplicate-count. What it keeps is the *identity*: the
 * coloured group icon and the member avatar stack — cues you can't do with
 * text alone.
 */
export function GroupHero({ group, members }: Props) {
  return (
    <View style={styles.hero}>
      <View style={[styles.heroIcon, { backgroundColor: alpha(group.color, 20) }]}>
        <Feather name={asFeather(group.icon, 'credit-card')} size={20} color={group.color} />
      </View>
      <AvatarStack people={members} size={26} max={5} ringColor={colors.bg} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: layout.screenPaddingH, paddingBottom: space.md },
  heroIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
