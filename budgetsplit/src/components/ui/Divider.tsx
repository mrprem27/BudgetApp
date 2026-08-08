import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, layout } from '../tokens';

type Props = {
  /**
   * `'text'` indents past the leading icon disc so the rule starts under the
   * label (AGENTS.md §4 and §12). `'none'` runs the full width.
   */
  indent?: 'none' | 'text';
};

/**
 * The hairline between rows in a card.
 *
 * One indent, one colour. Before this the same rule appeared as `marginLeft: 64`
 * (search, report-transactions), `56` (category detail), `66` (group budget —
 * built from `space.md + 34 + space.md`, where the 34 was itself a stray), and
 * full-width (group expenses), so lists that shared a row component still didn't
 * line up with each other.
 */
export function Divider({ indent = 'none' }: Props) {
  return <View style={[styles.base, indent === 'text' && styles.indented]} />;
}

const styles = StyleSheet.create({
  base: { height: 1, backgroundColor: colors.border },
  indented: { marginLeft: layout.dividerIndent },
});
