import { Text, View, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, layout } from '../tokens';

type Props = {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  /** Read aloud, and the only label — header actions are icon-only. */
  label: string;
  color?: string;
  /** A count in a red dot; 0 or absent shows nothing. */
  badge?: number;
};

/**
 * The one action button in a screen header (Home, Groups, Money, Insights): a 36pt circle, a
 * `layout.headerIcon` glyph, an optional count. Four tabs each had their own — bare icons, labelled
 * icons, a 32pt avatar beside 18pt icons — so nothing on the right lined up from one tab to the next.
 */
export function HeaderIconButton({ icon, onPress, label, color = colors.textSecondary, badge }: Props) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={8} style={styles.btn} accessibilityRole="button" accessibilityLabel={badge ? `${label}, ${badge}` : label}>
      <Feather name={icon} size={layout.headerIcon} color={color} />
      {!!badge && badge > 0 && (
        <View style={styles.badge}><Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text></View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, borderRadius: radius.sm, paddingHorizontal: 4, backgroundColor: colors.expense, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 9, lineHeight: 12, fontFamily: 'Inter_600SemiBold', color: colors.onAccent },
});
