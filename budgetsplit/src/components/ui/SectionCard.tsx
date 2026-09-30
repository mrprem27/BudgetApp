import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card } from './Card';
import { IconCircle } from './IconCircle';
import { Collapse } from './anim/Collapse';
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
 *
 * The body animates via `Collapse`, which is why **both** call sites could drop their
 * `LayoutAnimation.configureNext` and the `UIManager.setLayoutAnimationEnabledExperimental`
 * Android shim. AGENTS §11 bans `LayoutAnimation`: it's a legacy *global* API, so a
 * section toggle here also animated every unrelated layout change landing in the same
 * commit — and it's unreliable under the New Architecture. `Collapse` is scoped to this
 * subtree and honours Reduce Motion.
 */
export function SectionCard({
  title,
  subtitle,
  icon,
  iconColor = colors.accent,
  right,
  below,
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
  /** Under the header row, still part of the header (a budget section's bar). */
  below?: React.ReactNode;
  expanded: boolean;
  /** Omitted: the card is always open and its header is not a button. */
  onToggle?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Card clip style={[styles.card, style]}>
      <TouchableOpacity
        style={styles.headerWrap}
        onPress={onToggle}
        disabled={!onToggle}
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        accessibilityState={{ expanded }}
      >
        <View style={styles.header}>
          {icon && (
            <IconCircle icon={icon} size={layout.iconCircle} color={iconColor} bg={colors.accentMuted} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
          {right}
          {onToggle && <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />}
        </View>
        {below}
      </TouchableOpacity>

      <Collapse visible={expanded}>{children}</Collapse>
    </Card>
  );
}

const styles = StyleSheet.create({
  // The surface itself now comes from `Card` (AGENTS.md §3); only the spacing
  // this component adds on top of it lives here.
  card: { marginBottom: space.md },
  headerWrap: { padding: space.md, gap: space.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    // With the wrap's padding the header stays 64pt, as before `below` existed.
    minHeight: layout.iconCircle,
  },
  title: { ...type.bodySemi, color: colors.textPrimary },
  subtitle: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
});
