import React from 'react';
import { Text, StyleSheet, TextStyle } from 'react-native';
import { colors, type } from '../tokens';

/**
 * Matches the meaningful figures inside an insight sentence so we can color
 * them: ₹-amounts (₹40K, ₹1.59L, ₹52,000.00) and percentages (500%, 87%).
 * Capturing group → the matches are kept as array entries by String.split.
 */
const TOKEN = /([+-]?\s?₹\s?[\d.,]+(?:K|L|Cr)?|[+-]?\d+(?:\.\d+)?%)/g;
const IS_TOKEN = /^([+-]?\s?₹\s?[\d.,]+(?:K|L|Cr)?|[+-]?\d+(?:\.\d+)?%)$/;

type Props = {
  text: string;
  /** Color for the emphasized figures — pass the insight's semantic tint. */
  color: string;
  style?: TextStyle;
  numberOfLines?: number;
};

/**
 * Renders an insight sentence with its key figures highlighted in `color`
 * (e.g. coral for an overspend, green for an improvement). Keeps the prose in
 * the normal text color so only the numbers pop.
 */
export function InsightText({ text, color, style, numberOfLines }: Props) {
  const parts = text.split(TOKEN);
  return (
    <Text style={[styles.base, style]} numberOfLines={numberOfLines}>
      {parts.map((p, i) =>
        IS_TOKEN.test(p)
          ? <Text key={i} style={[styles.num, { color }]}>{p}</Text>
          : p,
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { ...type.body, color: colors.textPrimary },
  num: { fontFamily: 'Inter_600SemiBold' },
});
