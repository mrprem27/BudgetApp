import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout } from '../../tokens';
import { formatCompact } from '../../../lib/money';
import { AvatarStack } from '../AvatarStack';
import type { Person } from '../../../db/queries/persons';
import type { Share } from '../../../lib/splitMath';
import { SPLIT_MODE_LABEL, type SplitMode } from '../../../constants/enums';

type Props = {
  members: Person[];
  splitMembers: string[];
  splitType: SplitMode;
  total: number;
  payments: Share[];
  meId: string | undefined;
  onOpenSplit: () => void;
  onOpenPayers: () => void;
  /** The screen's kind colour, so the summary agrees with the rest of the form. */
  accent?: string;
};

/** "Split with [avatars] · Equal · ₹X each" + "Paid by …" rows (shared expense). */
export function SplitSummary({ members, splitMembers, splitType, total, payments, meId, onOpenSplit, onOpenPayers, accent = colors.accent }: Props) {
  const inSplit = members.filter(m => splitMembers.includes(m.id));
  const perEach = inSplit.length > 0 ? Math.round(total / inSplit.length) : 0;
  const summary = splitType === 'equal'
    ? `${SPLIT_MODE_LABEL.equal} · ${formatCompact(perEach)} each`
    : SPLIT_MODE_LABEL[splitType];
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
          <Text style={[styles.splitWithValue, { color: accent }]}>{summary}</Text>
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
  // Height matched to `ui/Input`, not padded to whatever the 24pt avatars happened to make
  // (which came out 56 against the title field's 48). Two heights in one column read as two
  // different kinds of control.
  splitWithRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: layout.fieldHeight, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  splitWithLabel: { ...type.body, color: colors.textSecondary },
  splitWithRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  splitWithValue: { ...type.labelSemi, color: colors.accent },
  // Symmetric padding: with only `paddingTop` the row's tap target ran to the block's very
  // edge, and the 44pt target (AGENTS §6) was made up entirely of space above the text.
  paidByLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.sm },
  paidByLabel: { ...type.body, color: colors.textSecondary },
  paidByValue: { ...type.bodySemi, color: colors.textPrimary },
});
