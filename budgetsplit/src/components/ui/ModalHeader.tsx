import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, type, space, layout } from '../tokens';

type Props = {
  title: string;
  onClose: () => void;
  /**
   * A second line under the title, for the one fact that qualifies the whole
   * form — a transaction's destination, say. Tappable when `onPressSubtitle` is
   * given, and then it carries a chevron so it reads as a control.
   */
  subtitle?: string;
  onPressSubtitle?: () => void;
  subtitleAccessibilityLabel?: string;
  /** Optional control rendered at the right (e.g. a ✓ save button). */
  right?: React.ReactNode;
  /** Close icon — defaults to ✕. */
  closeIcon?: React.ComponentProps<typeof Feather>['name'];
};

/** Full-screen modal header: ✕ left · title (+ optional subtitle) centered · optional control right. */
export function ModalHeader({
  title, onClose, subtitle, onPressSubtitle, subtitleAccessibilityLabel, right, closeIcon = 'x',
}: Props) {
  const insets = useSafeAreaInsets();

  const subtitleBody = subtitle ? (
    <View style={styles.subRow}>
      <Text style={styles.subtitle} numberOfLines={1}>
        {subtitle}
      </Text>
      {!!onPressSubtitle && <Feather name="chevron-down" size={13} color={colors.textSecondary} />}
    </View>
  ) : null;

  return (
    <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
      <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.side} accessibilityRole="button" accessibilityLabel="Close">
        <Feather name={closeIcon} size={24} color={colors.textPrimary} />
      </TouchableOpacity>
      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {onPressSubtitle && subtitleBody ? (
          <TouchableOpacity
            onPress={onPressSubtitle}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={subtitleAccessibilityLabel ?? subtitle}
          >
            {subtitleBody}
          </TouchableOpacity>
        ) : subtitleBody}
      </View>
      <View style={[styles.side, styles.sideRight]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm, minHeight: 52 },
  center: { flex: 1, alignItems: 'center' },
  title: { ...type.heading, color: colors.textPrimary, textAlign: 'center' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, maxWidth: '100%' },
  subtitle: { ...type.caption, color: colors.textSecondary, flexShrink: 1 },
  side: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sideRight: { alignItems: 'flex-end' },
});
