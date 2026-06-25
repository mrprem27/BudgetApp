import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, space } from '../tokens';
import { formatCompact } from '../../lib/money';

type Props = {
  /** Net balance in paise: > 0 = owed to you (green), < 0 = you owe (coral). */
  net: number;
};

/** Compact owe/owed money chip, e.g. "+₹800" (green) or "−₹2.1k" (coral). */
export function BalanceChip({ net }: Props) {
  if (net === 0) return null;
  const positive = net > 0;
  const color = positive ? colors.income : colors.expense;
  return (
    <View style={[styles.chip, { backgroundColor: color + '1A' }]}>
      <Text style={[styles.text, { color }]}>
        {positive ? '+' : '−'}{formatCompact(Math.abs(net))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: 8, paddingHorizontal: space.sm, paddingVertical: 4, flexShrink: 0 },
  text: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, letterSpacing: -0.5, fontWeight: '700' },
});
