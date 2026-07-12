import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, type, space, layout } from '../tokens';

type Props = {
  title: string;
  onClose: () => void;
  /** Optional control rendered at the right (e.g. a ✓ save button). */
  right?: React.ReactNode;
  /** Close icon — defaults to ✕. */
  closeIcon?: React.ComponentProps<typeof Feather>['name'];
};

/** Full-screen modal header: ✕ left · title centered · optional control right. */
export function ModalHeader({ title, onClose, right, closeIcon = 'x' }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
      <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.side} accessibilityRole="button" accessibilityLabel="Close">
        <Feather name={closeIcon} size={24} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <View style={[styles.side, styles.sideRight]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm, minHeight: 52 },
  title: { ...type.heading, color: colors.textPrimary, flex: 1, textAlign: 'center' },
  side: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sideRight: { alignItems: 'flex-end' },
});
