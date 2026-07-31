import React from 'react';
import { Text, StyleSheet, TextStyle, View } from 'react-native';
import { colors, type, space } from '../tokens';

/**
 * The one uppercase eyebrow label used everywhere: "ACTIVE · 3", "GET STARTED",
 * "RECOMMENDATIONS", "SHIFTS VS LAST MONTH". Replaces ~20 near-identical
 * inline TextStyle declarations across screens (fontSize varied 10/11/12,
 * letterSpacing varied 0.5/0.8/1, colour occasionally drifted).
 *
 * `count` right-side counter is baked in so callers stop concatenating
 * ` · ${n}` into the label string.
 */
export function SectionLabel({
  children,
  count,
  style,
  tint,
  first = false,
}: {
  children: React.ReactNode;
  count?: number;
  style?: TextStyle;
  /** Optional tint for the label (e.g., an accent-coloured section header). */
  tint?: string;
  /** First label on a screen has no top margin. */
  first?: boolean;
}) {
  return (
    <View style={[styles.wrap, first && styles.first]}>
      <Text style={[styles.label, tint ? { color: tint } : null, style]}>
        {children}
        {count != null && <Text style={styles.count}>{`  ${count}`}</Text>}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  first: { marginTop: 0 },
  label: {
    ...type.overline,
    color: colors.textMuted,
  },
  count: {
    ...type.overline,
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
});
