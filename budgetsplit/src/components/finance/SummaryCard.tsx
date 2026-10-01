import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space } from '../tokens';
import { Card } from '../ui/Card';

/**
 * The card a Budget tab and a Recurring tab both open on (`U-80`). One layout, so switching
 * between the two never moves the heading or the figure: a heading line (with room for one
 * action), the figure, the tab's own middle (a bar, or three facts), and a last line with the
 * tab's own left side and Expand all at its right end.
 *
 * The heading line keeps the height of a small chip whether or not it carries one, which is
 * what holds the figure at the same place on both.
 */
export function SummaryCard({ label, action, amount, side, children, foot, expand, link, style }: {
  label: React.ReactNode;
  /** One small control at the heading's right (Budget's Edit). */
  action?: React.ReactNode;
  amount: React.ReactNode;
  /** At the figure's right, on its baseline (Budget's percent used). */
  side?: React.ReactNode;
  children?: React.ReactNode;
  /** The last line's left side: filters, or a caption. */
  foot?: React.ReactNode;
  /** Omitted when there is nothing to expand. */
  expand?: { open: boolean; onPress: () => void };
  /** In Expand all's place, on a card with nothing to expand: a way to the full screen. */
  link?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Card padded style={[styles.card, style]}>
      <View style={styles.head}>
        {label}
        {action}
      </View>
      <View style={styles.amountRow}>
        {amount}
        {side}
      </View>
      {children}
      {(foot || expand || link) && (
        <View style={styles.foot}>
          <View style={styles.footLeft}>{foot}</View>
          {expand && <ExpandAll open={expand.open} onPress={expand.onPress} />}
          {link && !expand && (
            <TouchableOpacity style={styles.expandAll} onPress={link.onPress} hitSlop={10} accessibilityRole="link">
              <Text style={styles.expandAllText}>{link.label}</Text>
              <Feather name="chevron-right" size={14} color={colors.accent} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </Card>
  );
}

/** A heading for the card when it needs no ⓘ. */
export function SummaryLabel({ children, color = colors.textMuted }: { children: string; color?: string }) {
  return <Text style={[styles.label, { color }]} numberOfLines={1}>{children}</Text>;
}

/**
 * Expand or collapse every box under the card. Written "All" on both tabs: the full label does
 * not fit beside Budget's three filters on a 375pt phone, and two wordings for one control was
 * the thing to avoid.
 */
function ExpandAll({ open, onPress }: { open: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.expandAll} onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={open ? 'Collapse all' : 'Expand all'}>
      <Feather name={open ? 'chevrons-up' : 'chevrons-down'} size={14} color={colors.accent} />
      <Text style={styles.expandAllText}>All</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: space.md },
  // 28: a small chip's height (`Chip` `sm`), held with or without one.
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28, marginBottom: space.xs },
  label: { ...type.sectionLabel, flexShrink: 1 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  foot: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.smd, minHeight: 28 },
  footLeft: { flex: 1 },
  expandAll: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  expandAllText: { ...type.labelSemi, color: colors.accent },
});
