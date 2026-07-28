import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, shadow } from '../tokens';

/**
 * A card with a tappable header that discloses its body — the Budget and
 * Categories screens each hand-rolled this (card wrapper, header row, chevron,
 * conditional body).
 *
 * Beyond de-duplication this fixes an a11y gap both copies shared: a disclosure
 * needs `accessibilityState={{ expanded }}`, which neither set. Screen readers
 * announced them as plain buttons with no indication of open/closed. Using this
 * component makes that correct by construction.
 *
 * The two screens differ only in what sits in the header, so that's a slot:
 * pass `icon` for a leading disc, and `subtitle` or `right` for the trailing
 * detail (a count badge, a total, …).
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
  /** Secondary line under the title (e.g. "3 set · ₹12k/mo"). */
  subtitle?: string;
  /** Optional leading Feather icon in a tinted disc. */
  icon?: keyof typeof Feather.glyphMap;
  iconColor?: string;
  /** Optional node before the chevron (e.g. a count badge). */
  right?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  style?: object;
}) {
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
          <View style={[styles.icon, { backgroundColor: colors.accentMuted }]}>
            <Feather name={icon} size={16} color={iconColor} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        {right}
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </TouchableOpacity>

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
});
