import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { colors, type, space } from '../../tokens';
import { IconCircle } from '../../ui/IconCircle';
import { PressableScale } from '../../ui/PressableScale';
import type { Badge } from '../../../lib/badges';

/**
 * The profile's badges (`U-59`): one row of discs under your name, earned ones in colour first,
 * then the ones still to earn, muted. Tapping any of them says what it means and — for one not
 * yet earned — what is left. The rules live in `lib/badges`; this only draws them.
 */
export function ProfileBadges({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) return null;
  const earned = badges.filter(b => b.earned).length;
  return (
    <View style={styles.wrap}>
      <Text style={styles.head}>Badges · {earned} of {badges.length}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {badges.map(b => (
          <PressableScale
            key={b.id}
            style={styles.tile}
            onPress={() => Alert.alert(b.title, b.earned ? b.detail : `${b.progress ?? 'Not yet'}.\n\n${b.detail}`)}
            accessibilityLabel={`${b.title}, ${b.earned ? 'earned' : `not yet. ${b.progress ?? ''}`}`}
          >
            <IconCircle
              icon={b.icon}
              size={44}
              color={b.earned ? colors.accent : colors.textMuted}
              bg={b.earned ? undefined : colors.bgMuted}
            />
            <Text style={[styles.title, !b.earned && styles.titleLocked]} numberOfLines={2}>{b.title}</Text>
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  head: { ...type.sectionLabel, color: colors.textMuted, marginBottom: space.sm },
  row: { gap: space.md, paddingRight: space.md },
  tile: { width: 72, alignItems: 'center', gap: space.xs },
  title: { ...type.caption, color: colors.textPrimary, textAlign: 'center' },
  titleLocked: { color: colors.textMuted },
});
