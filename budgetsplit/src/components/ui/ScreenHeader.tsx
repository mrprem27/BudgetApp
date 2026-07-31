import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, layout } from '../tokens';

type Props = {
  title: string;
  /** Optional secondary line under the title (e.g., "3 active · ₹12k/mo"). */
  subtitle?: string;
  /** Show a back chevron on the left and call this when tapped. */
  onBack?: () => void;
  /** Optional content rendered on the right (e.g. action buttons). */
  right?: React.ReactNode;
  /** Larger, left-aligned title for top-level tab screens. */
  large?: boolean;
};

/**
 * Safe-area-aware screen header.
 *
 * Refinements:
 *  - Back button now 44×44 (iOS HIG minimum tap target — was 32×32, borderline
 *    unreachable on the largest phones).
 *  - Optional `subtitle` slot for context (used by Recurring, Group Budget, …
 *    replaces the ad-hoc "intro paragraph under the header" pattern that
 *    stole a screen's worth of vertical space).
 *  - Sharper title tracking comes from the updated `type.title` / `type.heading`
 *    tokens — no code change needed here.
 */
export function ScreenHeader({ title, subtitle, onBack, right, large }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.row}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            hitSlop={10}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Feather name="chevron-left" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : null}
        <View style={styles.titleCol}>
          <Text
            style={[large ? styles.titleLarge : styles.title, onBack && styles.titleWithBack]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={styles.right}>{right}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: layout.screenPaddingH,
    paddingBottom: space.sm,
    backgroundColor: colors.bg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.minTap,
    gap: space.xs,
  },
  backBtn: {
    marginLeft: -10,
    width: layout.minTap,
    height: layout.minTap,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: { flex: 1 },
  title: { ...type.heading, color: colors.textPrimary },
  titleLarge: { ...type.title, color: colors.textPrimary },
  titleWithBack: { ...type.heading },
  subtitle: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
