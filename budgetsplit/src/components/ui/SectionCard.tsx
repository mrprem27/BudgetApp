import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, shadow } from '../tokens';
import { alpha } from '../../theme';

/**
 * A card with a tappable header that discloses its body.
 *
 * Refinements:
 *  - Chevron now rotates 180° on expand (smoother than the icon-swap it did
 *    before, which caused a visible flicker at low animation FPS).
 *  - Icon disc uses a tinted background based on `iconColor` (was always
 *    `accentMuted`, which lied when the icon was e.g. amber).
 *  - Body gets a subtle top divider when expanded so it reads as
 *    "detail beneath a header" rather than "one big card".
 */
export function SectionCard({
  title,
  subtitle,
  icon,
  iconColor = colors.accent,
  right,
  expanded,
  onToggle,
  children,
  style,
}: {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Feather.glyphMap;
  iconColor?: string;
  right?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  style?: object;
}) {
  const rot = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(rot, {
      toValue: expanded ? 1 : 0,
      useNativeDriver: true,
      speed: 30,
      bounciness: 2,
    }).start();
  }, [expanded, rot]);

  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <View style={[styles.card, style]}>
      <TouchableOpacity
        style={styles.header}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        accessibilityState={{ expanded }}
      >
        {icon && (
          <View style={[styles.icon, { backgroundColor: alpha(iconColor, 13) }]}>
            <Feather name={icon} size={16} color={iconColor} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        {right}
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Feather name="chevron-down" size={18} color={colors.textMuted} />
        </Animated.View>
      </TouchableOpacity>

      {expanded && <View style={styles.bodyDivider} />}
      {expanded && children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.md,
    overflow: 'hidden',
    ...shadow.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, minHeight: 52 },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  subtitle: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  bodyDivider: { height: 1, backgroundColor: colors.divider, marginHorizontal: space.md },
});
