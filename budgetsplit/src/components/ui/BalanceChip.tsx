import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { space } from '../tokens';
import { formatCompact } from '../../lib/money';
import { oweView } from '../../lib/owe';

type Props = {
  /** Net balance in paise: > 0 = owed to you (green), < 0 = you owe (coral). */
  net: number;
};

/** Compact owe/owed money chip, e.g. "+₹800" (green) or "−₹2.1k" (coral). */
export function BalanceChip({ net }: Props) {
  if (net === 0) return null;
  const { color, sign, amount } = oweView(net);
  return (
    <View style={[styles.chip, { backgroundColor: color + '1A' }]}>
      <Text style={[styles.text, { color }]}>
        {sign}{formatCompact(amount)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: 8, paddingHorizontal: space.sm, paddingVertical: space.xs, flexShrink: 0 },
  text: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, letterSpacing: -0.5, fontWeight: '700' },
});
