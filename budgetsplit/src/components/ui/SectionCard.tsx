import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card } from './Card';
import { IconCircle } from './IconCircle';
import { colors, type, space, layout } from '../tokens';

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
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Card clip style={[styles.card, style]}>
      <TouchableOpacity
        style={styles.header}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        accessibilityState={{ expanded }}
      >
        {icon && (
          <IconCircle icon={icon} size={layout.iconCircle} color={iconColor} bg={colors.accentMuted} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        {right}
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {expanded && children}
    </Card>
  );
}

const styles = StyleSheet.create({
  // The surface itself now comes from `Card` (AGENTS.md §3); only the spacing
  // this component adds on top of it lives here.
  card: { marginBottom: space.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    minHeight: layout.rowMinHeight,
  },
  title: { ...type.bodySemi, color: colors.textPrimary },
  subtitle: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
});
