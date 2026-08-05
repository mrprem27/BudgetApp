import React from 'react';
import { Text, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { colors, type, space } from '../tokens';

/** Below this, a derived figure is mostly noise and should say so. */
export const LOW_SAMPLE_TXNS = 5;

type Props = {
  /** Transactions the figure above was computed from. */
  txnCount: number;
  /** e.g. "today" / "this month" — the window the count covers. */
  periodLabel?: string;
  /** Extra copy appended when the sample is thin. */
  lowSampleHint?: string;
  style?: StyleProp<TextStyle>;
};

/**
 * "Based on N transactions logged this month." Every figure this sits under is
 * extrapolated from manually-logged history, so it presents the confidence of a
 * live feed on data that may be stale. Extracted from HealthSheet's only copy.
 */
export function SampleNote({ txnCount, periodLabel = 'this month', lowSampleHint, style }: Props) {
  const low = txnCount < LOW_SAMPLE_TXNS;
  return (
    <Text style={[styles.note, low && styles.noteLow, style]}>
      Based on {txnCount} transaction{txnCount === 1 ? '' : 's'} logged {periodLabel}.
      {low && lowSampleHint ? ` ${lowSampleHint}` : ''}
    </Text>
  );
}

const styles = StyleSheet.create({
  note: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginBottom: space.md },
  noteLow: { color: colors.healthAmber },
});
