import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout } from '../../tokens';
import { formatCompact } from '../../../lib/money';
import { oweView } from '../../../lib/owe';
import { alpha } from '../../../theme';
import type { Person } from '../../../db/queries/persons';

type Settle = { from: string; to: string; amount: number };

type Props = {
  net: Record<string, number>;
  meId: string;
  simplifiedSettles: Settle[];
  personMap: Map<string, Person>;
  /** Navigate to a prefilled transfer with the counterpart. */
  onSettle: (personId: string) => void;
};

/**
 * The "you owe / owed to you" card at the top of a shared group. Shows an
 * explicit "All settled up" confirmation when the user is square, rather than
 * silently disappearing — per AGENTS.md §2, absence alone isn't feedback.
 * Only offers Settle when a real counterpart exists (otherwise the transfer
 * form would open with an empty payee).
 */
export function GroupBalanceCard({ net, meId, simplifiedSettles, personMap, onSettle }: Props) {
  const myNet = net[meId] ?? 0;
  if (myNet === 0) {
    return (
      <View style={[styles.balCard, { backgroundColor: alpha(colors.settle, 8), borderColor: alpha(colors.settle, 20) }]}>
        <Feather name="check-circle" size={18} color={colors.settle} style={{ marginRight: space.sm }} />
        <Text style={[styles.settledText, { color: colors.settle }]}>All settled up</Text>
      </View>
    );
  }
  const ov = oweView(myNet);
  const isOwe = ov.direction === 'owe';
  const primarySettle = isOwe
    ? simplifiedSettles.find(s => s.from === meId)
    : simplifiedSettles.find(s => s.to === meId);
  const primaryPerson = primarySettle
    ? personMap.get(isOwe ? primarySettle.to : primarySettle.from)
    : null;

  return (
    <View style={[styles.balCard, {
      backgroundColor: isOwe ? colors.expenseTint : colors.incomeTint,
      borderColor: isOwe ? colors.expenseTintStrong : colors.incomeTintStrong,
    }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.balCardLabel, { color: ov.color }]}>{isOwe ? 'YOU OWE' : "YOU'RE OWED"}</Text>
        <Text style={[styles.balCardAmt, { color: ov.color }]}>{formatCompact(Math.abs(myNet))}</Text>
      </View>
      {primaryPerson && (
        <TouchableOpacity
          style={styles.balCardBtn}
          onPress={() => onSettle(primaryPerson.id)}
          accessibilityRole="button"
          accessibilityLabel={`Settle up with ${primaryPerson.name}`}
        >
          <Text style={styles.balCardBtnText}>Settle up</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  balCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: layout.screenPaddingH, borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.sm + 2, marginBottom: space.sm, borderWidth: 1 },
  balCardLabel: { ...type.caption, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  balCardAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 22, letterSpacing: -0.5, lineHeight: 26 },
  balCardBtn: { paddingHorizontal: space.md + 2, paddingVertical: space.sm + 2, borderRadius: radius.md, backgroundColor: colors.accentMuted, borderWidth: 1, borderColor: colors.accent },
  balCardBtnText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  settledText: { ...type.body, fontFamily: 'Inter_600SemiBold' },
});
