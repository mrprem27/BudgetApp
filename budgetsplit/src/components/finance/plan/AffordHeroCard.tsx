import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, shadow } from '../../tokens';
import { alpha } from '../../../theme';
import { PressableScale } from '../../ui/PressableScale';
import { IconCircle } from '../../ui/IconCircle';

/**
 * Money's door to "Can I afford this?" — the question the tab exists to answer, so it is a card of
 * its own rather than a list row. One component in two places: under your money on Overview, and
 * first on Goals (`U-46`). The header icon and the row it duplicated are gone (`U-06`, `U-12`).
 */
export function AffordHeroCard({ onPress }: { onPress: () => void }) {
  return (
    <PressableScale style={styles.card} onPress={onPress} accessibilityLabel="Can I afford this? Check a purchase">
      <View style={styles.top}>
        <IconCircle icon="shopping-bag" size={40} color={colors.accent} />
        <View style={styles.text}>
          <Text style={styles.title}>Can I afford this?</Text>
          <Text style={styles.sub}>Your cash, bills and goals, before you buy</Text>
        </View>
      </View>
      {/* Reads like the field it opens, so the next step is obvious: type an amount. */}
      <View style={styles.field}>
        <Text style={styles.rupee}>₹</Text>
        <Text style={styles.placeholder}>Enter an amount</Text>
        <Feather name="arrow-right" size={18} color={colors.accent} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1,
    borderColor: alpha(colors.accent, 33), padding: space.md, gap: space.md, ...shadow.sm,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.smd },
  text: { flex: 1 },
  title: { ...type.subheading, color: colors.textPrimary },
  sub: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 48, paddingHorizontal: space.md,
    borderRadius: radius.md, backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border,
  },
  rupee: { fontFamily: 'SpaceMono_400Regular', fontSize: 18, color: colors.textMuted },
  placeholder: { ...type.body, color: colors.textMuted, flex: 1 },
});
