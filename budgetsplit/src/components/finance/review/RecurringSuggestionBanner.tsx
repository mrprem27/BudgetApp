import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../../tokens';
import { alpha } from '../../../theme';

/** Dismissible banner surfaced after a batch Save finds transactions that look
 *  recurring — never auto-created, always a tap-through to confirm. */
export function RecurringSuggestionBanner({ count, onPress, onDismiss }: { count: number; onPress: () => void; onDismiss: () => void }) {
  return (
    <View style={styles.banner}>
      <View style={styles.iconDot}>
        <Feather name="repeat" size={14} color={colors.accent} />
      </View>
      <TouchableOpacity style={{ flex: 1 }} onPress={onPress} accessibilityRole="button">
        <Text style={styles.text}>
          {count} of these look recurring — review?
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Feather name="x" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    marginHorizontal: space.md, marginBottom: space.xs,
    paddingHorizontal: space.md, paddingVertical: space.sm,
    borderRadius: radius.md, backgroundColor: colors.accentMuted,
    borderWidth: 1, borderColor: alpha(colors.accent, 33),
  },
  iconDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  text: { ...type.label, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
});
