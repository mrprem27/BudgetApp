import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, type, space, layout } from '../tokens';

type Props = {
  title: string;
  /** Optional secondary line beneath the title (context, e.g. "Split by items · 4/4"). */
  subtitle?: string;
  onClose: () => void;
  /** Optional control rendered at the right (e.g. a ✓ save button). */
  right?: React.ReactNode;
  /** Close icon — defaults to ✕. */
  closeIcon?: React.ComponentProps<typeof Feather>['name'];
};

/**
 * Full-screen modal header: ✕ left · title (+ optional subtitle) centered ·
 * optional control right. Symmetric side widths keep the title optically
 * centered no matter what `right` is.
 */
export function ModalHeader({ title, subtitle, onClose, right, closeIcon = 'x' }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
      <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.side} accessibilityRole="button" accessibilityLabel="Close">
        <Feather name={closeIcon} size={22} color={colors.textPrimary} />
      </TouchableOpacity>
      <View style={styles.titleCol}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.side, styles.sideRight]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPaddingH,
    paddingBottom: space.sm,
    minHeight: 56,
  },
  titleCol: { flex: 1, alignItems: 'center' },
  title: { ...type.heading, color: colors.textPrimary, textAlign: 'center' },
  subtitle: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  side: { width: layout.minTap, height: layout.minTap, alignItems: 'center', justifyContent: 'center' },
  sideRight: { alignItems: 'flex-end' },
});
