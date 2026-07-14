import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../../tokens';
import { formatCompact } from '../../../lib/money';
import { AvatarStack } from '../AvatarStack';
import type { Person } from '../../../db/queries/persons';
import type { Share } from '../../../lib/splitMath';

type Props = {
  members: Person[];
  splitMembers: string[];
  splitType: string;
  total: number;
  payments: Share[];
  meId: string | undefined;
  onOpenSplit: () => void;
  onOpenPayers: () => void;
};

/** "Split with [avatars] · Equal · ₹X each" + "Paid by …" rows (shared expense). */
export function SplitSummary({ members, splitMembers, splitType, total, payments, meId, onOpenSplit, onOpenPayers }: Props) {
  const inSplit = members.filter(m => splitMembers.includes(m.id));
  const perEach = inSplit.length > 0 ? Math.round(total / inSplit.length) : 0;
  const summary = splitType === 'equal'
    ? `Equal · ${formatCompact(perEach)} each`
    : splitType.charAt(0).toUpperCase() + splitType.slice(1);
  const payerName = payments.length === 1
    ? (payments[0].personId === meId ? 'you' : members.find(m => m.id === payments[0].personId)?.name ?? 'someone')
    : `${payments.length} people`;
  const payers = payments.map(p => members.find(m => m.id === p.personId)).filter((m): m is Person => !!m);

  return (
    <View>
      <TouchableOpacity style={styles.splitWithRow} onPress={onOpenSplit} accessibilityRole="button" accessibilityLabel="Configure split">
        <Text style={styles.splitWithLabel}>Split with</Text>
        <View style={styles.splitWithRight}>
          <AvatarStack people={inSplit} size={24} max={4} />
          <Text style={styles.splitWithValue}>{summary}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.paidByLine} onPress={onOpenPayers} accessibilityRole="button" accessibilityLabel="Who paid">
        <Text style={styles.paidByLabel}>Paid by</Text>
        {payments.length > 1 && <AvatarStack people={payers} size={20} max={3} />}
        <Text style={styles.paidByValue}>{payerName}</Text>
        <Feather name="chevron-right" size={15} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  splitWithRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.md, borderRadius: radius.md, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  splitWithLabel: { ...type.body, color: colors.textSecondary },
  splitWithRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  splitWithValue: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  paidByLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingTop: space.sm + 2 },
  paidByLabel: { ...type.body, color: colors.textSecondary },
  paidByValue: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
});
