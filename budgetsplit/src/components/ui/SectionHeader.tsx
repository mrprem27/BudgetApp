import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, space } from '../tokens';

type Props = {
  title: string;
  /** Right-aligned slot — a count, an "Edit" pill, a filter control. */
  right?: React.ReactNode;
  /** Drop the top margin when this is the first thing in a scroll container. */
  first?: boolean;
};

/**
 * The uppercase eyebrow above a list section (AGENTS.md §12).
 *
 * It owns its own vertical margins on purpose. Callers used to set
 * `marginTop`/`marginBottom` on the label *and* a `gap` on the scroll
 * container, which silently added up — the group Expenses tab was getting 24px
 * above every date header from `gap: space.sm` + `marginTop: space.md`, plus a
 * stray 8px between the header and its first row. Let this component space
 * itself and don't put a `gap` on the container.
 */
export function SectionHeader({ title, right, first }: Props) {
  return (
    <View style={[styles.row, first && styles.first]}>
      <Text style={styles.title}>{title}</Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  first: { marginTop: 0 },
  title: { ...type.sectionLabel, color: colors.textMuted },
});
