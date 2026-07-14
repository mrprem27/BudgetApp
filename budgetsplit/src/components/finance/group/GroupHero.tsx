import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../../tokens';
import { asFeather } from '../../../constants/palette';
import { formatCompact } from '../../../lib/money';
import { AvatarStack } from '../AvatarStack';
import type { BudgetGroup } from '../../../db/queries/groups';
import type { Person } from '../../../db/queries/persons';

type Props = {
  group: BudgetGroup;
  isPersonal: boolean;
  members: Person[];
  personalMonthSpend: number;
};

/** Group Detail hero: icon tile + name + (personal: month spend | shared: member stack). */
export function GroupHero({ group, isPersonal, members, personalMonthSpend }: Props) {
  return (
    <View style={styles.hero}>
      <View style={[styles.heroIcon, { backgroundColor: group.color + '33' }]}>
        <Feather name={asFeather(group.icon, 'credit-card')} size={22} color={group.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.heroName} numberOfLines={1}>{group.name}</Text>
        {isPersonal ? (
          <Text style={styles.heroSub} numberOfLines={1}>{`${formatCompact(personalMonthSpend)} this month`}</Text>
        ) : (
          <View style={styles.heroMembers}>
            <AvatarStack people={members} size={20} max={4} ringColor={colors.bg} />
            <Text style={styles.heroSub}>{members.length} member{members.length > 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingBottom: space.md },
  heroIcon: { width: 48, height: 48, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  heroName: { ...type.title, fontSize: 26, color: colors.textPrimary },
  heroSub: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  heroMembers: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xs },
});
