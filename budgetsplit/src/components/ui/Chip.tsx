import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PressableScale } from './PressableScale';
import { colors, type, space, radius, layout } from '../tokens';
import { alpha } from '../../theme';

type Props = {
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  /** Leading node — a colour dot, an emoji, an avatar. Overrides `icon`. */
  leading?: React.ReactNode;
  selected?: boolean;
  /** Colour of the selected state. Defaults to `colors.accent`. */
  accent?: string;
  onPress?: () => void;
  /** Renders a trailing ✕. Presence of this prop is what makes a chip removable. */
  onRemove?: () => void;
  /**
   * Renders a trailing `chevron-down` — "tapping this opens a picker". Use it for
   * chips that always hold a value (category, date); use `onRemove` for chips whose
   * value can be taken away. One trailing affordance, never both: ✕ means clearable,
   * ⌄ means choosable, and a chip that showed both would claim to be each.
   */
  chevron?: boolean;
  /** Fill the remaining width of a chip row (`flex: 1`). */
  grow?: boolean;
  /** Caps the label width; it truncates rather than pushing the row wider. */
  maxWidth?: number;
  accessibilityLabel?: string;
};

/**
 * The pill. Selectable, optionally removable.
 *
 * Replaces six near-identical implementations that differed only in padding and
 * `maxWidth`: the group-selector pill, Review's `assignChip` and `FChip`, the
 * category/date pills in Add, and onboarding's budget-preset and day chips.
 *
 * Touch target: the pill is 36pt tall so a chip row doesn't look bloated, with
 * `hitSlop` making up the rest of AGENTS.md §6's 44pt. §6 governs the *tappable*
 * area, not the painted one — this is the same trade §6 itself endorses with
 * `hitSlop={10}` on icon buttons. The old chips were 30–32pt with no hitSlop at
 * all, so they genuinely under-shot it.
 */
export function Chip({
  label, icon, leading, selected, accent = colors.accent,
  onPress, onRemove, chevron, grow, maxWidth, accessibilityLabel,
}: Props) {
  const body = (
    <View
      style={[
        styles.chip,
        selected && { backgroundColor: alpha(accent, 20), borderColor: accent },
        maxWidth != null && { maxWidth },
      ]}
    >
      {leading ?? (icon ? <Feather name={icon} size={14} color={selected ? accent : colors.textSecondary} /> : null)}

      <Text style={[styles.label, selected && { color: accent, ...type.labelSemi }]} numberOfLines={1}>
        {label}
      </Text>

      {onRemove ? (
        <TouchableOpacity
          onPress={onRemove}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
        >
          <Feather name="x" size={14} color={selected ? accent : colors.textMuted} />
        </TouchableOpacity>
      ) : chevron ? (
        <Feather name="chevron-down" size={14} color={colors.textMuted} />
      ) : null}
    </View>
  );

  if (!onPress) return grow ? <View style={styles.grow}>{body}</View> : body;
  const pressable = (
    <PressableScale
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {body}
    </PressableScale>
  );
  // `grow` has to go on a plain wrapper: PressableScale puts its `style` on the
  // inner Animated.View, so a flex there would be measured against a Pressable
  // that isn't itself flexible.
  return grow ? <View style={styles.grow}>{pressable}</View> : pressable;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: layout.touchMin - 8,
    paddingHorizontal: space.smd,
    borderRadius: radius.pill,
    // `bgMuted`, not `bgCard`. Unset chips were card-coloured against the screen
    // background — a 1-step difference on a dark theme — so a row of controls read
    // as flat text and "which of these is on" was unanswerable at a glance.
    // `bgMuted` is the token for exactly this (§10: tab pills, segmented controls).
    backgroundColor: colors.bgMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { ...type.label, color: colors.textSecondary, flexShrink: 1 },
  grow: { flex: 1 },
});
