import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Divider } from '../ui/Divider';
import { colors, space, radius } from '../tokens';

type Props = {
  /** First row in its section — rounds the top and draws the top border. */
  first: boolean;
  /** Last row in its section — rounds the bottom and closes the card. */
  last: boolean;
  /**
   * Applies the card's horizontal gutter. Turn off for a child that brings its own
   * padding — e.g. Search's "Show N more" row, which is a full-width tap target.
   */
  padded?: boolean;
  children: React.ReactNode;
};

/**
 * One transaction row inside a section-sized card.
 *
 * A section's rows share a single card: side borders always, the first row rounds
 * the top, the last rounds the bottom, and an indented hairline separates the rest.
 *
 * This is the chrome `search.tsx` and `report-transactions.tsx` had already
 * arrived at independently (as copy-pasted `cell`/`cellFirst`/`cellLast` styles),
 * and it's now the only one. The same `TransactionRow` was previously rendered
 * four different ways: carded on those two screens, and bare on the group Expenses
 * tab, Personal activity and category detail — with divider indents of 64, 56,
 * full-width and none respectively. AGENTS.md §3 is explicit that rows must not
 * float bare on the dark background, and the settlement avatar ring is drawn in
 * `bgCard`, so the bare variants were subtly wrong as well as inconsistent.
 */
export function TxnCell({ first, last, padded = true, children }: Props) {
  return (
    <View style={[styles.cell, first && styles.cellFirst, last && styles.cellLast]}>
      {padded ? <View style={styles.inner}>{children}</View> : children}
      {!last && <Divider indent="text" />}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    backgroundColor: colors.bgCard,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
  },
  cellFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  cellLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  inner: { paddingHorizontal: space.md },
});
