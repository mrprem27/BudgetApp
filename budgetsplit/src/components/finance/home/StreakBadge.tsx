import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type } from '../../tokens';

/**
 * Days in a row you've logged something, as a small ⚡ and a number beside the greeting on Home
 * (it sat after your name until 2026-10-01).
 * Shown from two days — one day is not a streak. The full calendar card stays opt-in
 * (Settings › Sections).
 *
 * Plain glyph and figure, not a chip (`U-61`): a 36pt pill beside the name was as heavy as the
 * name itself and crowded the header's buttons.
 */
export function StreakBadge({ days }: { days: number }) {
  if (days < 2) return null;
  return (
    <View style={styles.row} accessible accessibilityLabel={`${days}-day logging streak`}>
      <Feather name="zap" size={13} color={colors.accent} />
      <Text style={styles.text}>{days}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  text: { ...type.labelSemi, color: colors.accent },
});
