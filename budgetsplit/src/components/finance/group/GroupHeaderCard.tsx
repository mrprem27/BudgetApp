import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, type, space, radius, layout } from '../../tokens';
import { alpha } from '../../../theme';
import { asFeather } from '../../../constants/palette';
import { formatCompact } from '../../../lib/money';
import { headerBalance } from '../../../lib/owe';
import { fullTextOnHold } from '../../../hooks/useFullTextOnHold';
import { AvatarStack } from '../AvatarStack';
import type { BudgetGroup } from '../../../db/queries/groups';
import type { Person } from '../../../db/queries/persons';

type Props = {
  group: BudgetGroup;
  members: Person[];
  /** My net in this group: positive = I'm owed. */
  myNet: number;
  /** Who a "Settle up" would open a transfer with — null when there is no counterpart. */
  settleWith: Person | null;
  onSettle: (personId: string) => void;
};

/**
 * One card at the top of a shared group: who it is (icon, name, members) on the left, where I
 * stand (owed / owe / settled up) on the right, over a faint wash of the group's own colour.
 * Replaces the hero row and the separate balance card — two stacked boxes for one fact.
 */
export function GroupHeaderCard({ group, members, myNet, settleWith, onSettle }: Props) {
  const bal = headerBalance(myNet);
  const tone = bal.direction === 'owe' ? colors.expense : bal.direction === 'owed' ? colors.income : colors.settle;

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={[alpha(group.color, 40), colors.bgCard]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: alpha(group.color, 25) }]}>
          <Feather name={asFeather(group.icon, 'credit-card')} size={22} color={group.color} />
        </View>
        <View style={styles.who}>
          <Text style={styles.name} numberOfLines={1} {...fullTextOnHold(group.name)}>{group.name}</Text>
          <View style={styles.members}>
            <AvatarStack people={members} size={20} max={4} ringColor={colors.bgCard} />
            <Text style={styles.sub}>{members.length} member{members.length === 1 ? '' : 's'}</Text>
          </View>
        </View>
        <View style={styles.bal}>
          <Text style={[styles.balHead, { color: tone }]}>{bal.headline}</Text>
          {bal.direction !== 'settled' && (
            <Text style={[styles.balAmt, { color: tone }]}>{formatCompact(bal.amount)}</Text>
          )}
          {settleWith && bal.direction !== 'settled' && (
            <TouchableOpacity
              style={styles.settle}
              onPress={() => onSettle(settleWith.id)}
              accessibilityRole="button"
              accessibilityLabel={`Settle up with ${settleWith.name}`}
              hitSlop={8}
            >
              <Text style={styles.settleText}>Settle up</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: layout.screenPaddingH, marginBottom: space.md, padding: space.md, overflow: 'hidden',
    backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 48, height: 48, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  who: { flex: 1, minWidth: 0 },
  name: { ...type.heading, color: colors.textPrimary },
  members: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xs },
  sub: { ...type.caption, color: colors.textSecondary },
  bal: { alignItems: 'flex-end', maxWidth: '44%' },
  balHead: { ...type.caption, fontFamily: 'Inter_600SemiBold' },
  balAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 20, letterSpacing: -0.5 },
  settle: { marginTop: space.xs, paddingHorizontal: space.smd, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentMuted },
  settleText: { ...type.caption, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
});
