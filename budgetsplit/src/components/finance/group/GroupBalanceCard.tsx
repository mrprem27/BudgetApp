import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, type, space, radius, layout } from '../../tokens';
import { formatCompact } from '../../../lib/money';
import { oweView } from '../../../lib/owe';
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
 * The "you owe / owed to you" card at the top of a shared group. Renders nothing
 * when the user is square. Only offers Settle when a real counterpart exists
 * (otherwise the transfer form would open with an empty payee).
 */
export function GroupBalanceCard({ net, meId, simplifiedSettles, personMap, onSettle }: Props) {
  const myNet = net[meId] ?? 0;
  if (myNet === 0) return null;
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
  balCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: layout.screenPaddingH, borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.sm + 2, marginBottom: space.md, borderWidth: 1 },
  balCardLabel: { ...type.overline, marginBottom: 2 },
  balCardAmt: { ...type.amountLG, letterSpacing: -0.5 },
  balCardBtn: { paddingHorizontal: space.md + 2, paddingVertical: space.sm + 2, borderRadius: radius.md, backgroundColor: colors.accentMuted, borderWidth: 1, borderColor: colors.accent },
  balCardBtnText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
});
