import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout } from '../tokens';
import { alpha } from '../../theme';

type Props = {
  icon: keyof typeof Feather.glyphMap;
  /** The message. Truncates to one line — a banner is a status, not a paragraph. */
  text: string;
  /**
   * A short, fixed trailing fact that must survive `text` truncating — a count,
   * "N of M", "paid by X". Same reasoning as `TabPills`' `badge` prop: appended
   * into `text` itself, a long value at the end is exactly what gets cut when
   * the label runs long, and the count/fact is usually the thing being scanned.
   */
  badge?: string;
  /** Trailing text action ("Show all", "Review"). */
  actionLabel?: string;
  onAction?: () => void;
  /** Renders a trailing ✕. Independent of `actionLabel`. */
  onDismiss?: () => void;
  /** Tapping the banner body. Use when the whole strip is the affordance. */
  onPress?: () => void;
  /** Tint for the icon, border and action. Defaults to `colors.accent`. */
  tone?: string;
  /**
   * Whether the banner adds its own horizontal margin (default `true`).
   *
   * Pass `false` inside a container that is already padded to `layout.screenPaddingH` —
   * Home's ScrollView is — or the padding doubles and the strip sits visibly narrower than
   * everything around it.
   */
  inset?: boolean;
};

/**
 * An inline status strip above a list: what's being filtered, what was just found.
 *
 * The chrome (`accentMuted` fill + `alpha(tone, 33)` border + `radius.md`) was written
 * out twice with two different horizontal margins — Review's focus banner used
 * `layout.screenPaddingH` and `RecurringSuggestionBanner` used `space.md`, which happen
 * to be the same number, so the two strips stacked on one screen only *looked*
 * consistent by coincidence.
 */
export function Banner({ icon, text, badge, actionLabel, onAction, onDismiss, onPress, tone = colors.accent, inset = true }: Props) {
  const body = (
    <>
      <Feather name={icon} size={14} color={tone} />
      <Text style={styles.text} numberOfLines={1}>{text}</Text>
      {badge && <Text style={styles.badge} numberOfLines={1}>{badge}</Text>}
    </>
  );

  return (
    <View style={[styles.banner, !inset && styles.flush, { borderColor: alpha(tone, 33) }]}>
      {onPress ? (
        <TouchableOpacity style={styles.pressBody} onPress={onPress} accessibilityRole="button" accessibilityLabel={badge ? `${text}, ${badge}` : text}>
          {body}
        </TouchableOpacity>
      ) : body}

      {actionLabel && onAction && (
        <TouchableOpacity onPress={onAction} hitSlop={layout.touchMin / 4} accessibilityRole="button">
          <Text style={[styles.action, { color: tone }]}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
      {onDismiss && (
        <TouchableOpacity onPress={onDismiss} hitSlop={layout.touchMin / 4} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Feather name="x" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: layout.screenPaddingH,
    marginBottom: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accentMuted,
    borderWidth: 1,
  },
  flush: { marginHorizontal: 0 },
  pressBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  text: { ...type.labelSemi, color: colors.textPrimary, flex: 1 },
  // Not `flex` — this is the part that must never shrink or truncate away.
  badge: { ...type.labelSemi, color: colors.textPrimary, flexShrink: 0 },
  action: { ...type.labelSemi },
});
