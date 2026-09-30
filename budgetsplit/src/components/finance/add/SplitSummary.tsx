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

  // Two rows of one box, the same shape (`U-67`). "Paid by" was a centred text link under a
  // bordered field — two different kinds of control for two halves of one question.
  return (
    <View style={styles.box}>
      <TouchableOpacity style={styles.row} onPress={onOpenSplit} accessibilityRole="button" accessibilityLabel={`Split with ${inSplit.length}. ${summary}. Change`}>
        <Text style={styles.label}>Split with</Text>
        <View style={styles.right}>
          <AvatarStack people={inSplit} size={24} max={4} />
          <Text style={[styles.value, { color: accent }]} numberOfLines={1}>{summary}</Text>
          <Feather name="chevron-right" size={15} color={colors.textMuted} />
        </View>
      </TouchableOpacity>
      <View style={styles.divider} />
      <TouchableOpacity style={styles.row} onPress={onOpenPayers} accessibilityRole="button" accessibilityLabel={`Paid by ${payerName}. Change`}>
        <Text style={styles.label}>Paid by</Text>
        <View style={styles.right}>
          <AvatarStack people={payers} size={24} max={3} />
          <Text style={[styles.value, { color: accent }]} numberOfLines={1}>{payerName}</Text>
          <Feather name="chevron-right" size={15} color={colors.textMuted} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  // Each row the height of `ui/Input`, so the block lines up with the fields above it.
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: layout.fieldHeight, paddingHorizontal: space.md },
  label: { ...type.body, color: colors.textSecondary },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  value: { ...type.labelSemi, flexShrink: 1 },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: space.md },
});
