import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { IconCircle } from './IconCircle';
import { PressableScale } from './PressableScale';
import { colors, type, space, layout } from '../tokens';

type Props = {
  /** Leading icon, rendered in an `IconCircle` (AGENTS.md §8). */
  icon?: keyof typeof Feather.glyphMap;
  /** Icon tint; also drives the disc's background tint. */
  iconColor?: string;
  /** Replaces the icon disc entirely — an avatar, a checkbox, a colour swatch. */
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Right-hand value. A string is styled for you; a node is rendered as-is. */
  value?: React.ReactNode;
  /**
   * `'inline'` — `[icon] title ......... value [›]` (AGENTS.md §4; settings rows).
   * `'stacked'` — `[icon] title above value [›]`, where the value gets the full
   * row width. Use this for form rows whose value can be long: category names,
   * place labels, "Monthly · until 12 Dec". It's also a stronger signifier —
   * a labelled value reads as editable, where a bare pill doesn't.
   */
  variant?: 'inline' | 'stacked';
  /** Defaults to true when `onPress` is set. */
  chevron?: boolean;
  onPress?: () => void;
  /** Floor for the row height. Defaults to `layout.rowMinHeight` (52). */
  minHeight?: number;
  /** Tints icon and title with `colors.expense` for destructive rows. */
  danger?: boolean;
  /** Marks the row as a chosen option, so screen readers announce the selection
   *  (DEBT U11 swept every selection control in the app for exactly this). */
  selected?: boolean;
  accessibilityLabel?: string;
};

/**
 * One row in a card: leading icon, label, value, chevron.
 *
 * The single row shape the app was missing. `SettingsRow` is now a thin wrapper
 * over this, and the ~10 hand-rolled variants (differing only in avatar size and
 * font weight) collapse into it.
 *
 * A note on truncation: `V2_PRODUCT_REVIEW.md` §7.4 called truncated values "a
 * pattern, not four bugs", caused by fixed-width value text. Here the *label*
 * holds its width and the *value* shrinks (inline), or the value gets the whole
 * row (stacked) — which is what closes that class.
 */
export function ListRow({
  icon, iconColor = colors.accent, leading, title, subtitle, value,
  variant = 'inline', chevron, onPress, minHeight, danger, selected, accessibilityLabel,
}: Props) {
  const tint = danger ? colors.expense : iconColor;
  const showChevron = chevron ?? !!onPress;
  const stacked = variant === 'stacked';

  const body = (
    <View style={[styles.row, { minHeight: minHeight ?? layout.rowMinHeight }]}>
      {leading ?? (icon ? <IconCircle icon={icon} size={layout.iconCircle} color={tint} /> : null)}

      <View style={styles.center}>
        <Text
          style={[
            stacked ? styles.stackedLabel : styles.title,
            danger && !stacked && { color: colors.expense },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>

        {stacked
          ? renderValue(value, styles.stackedValue, danger)
          : subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>

      {!stacked && (
        <View style={styles.right}>{renderValue(value, styles.value, false)}</View>
      )}

      {showChevron && <Feather name="chevron-right" size={16} color={colors.textMuted} />}
    </View>
  );

  if (!onPress) return body;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={selected == null ? undefined : { selected }}
    >
      {body}
    </PressableScale>
  );
}

/** Strings get the row's value styling; nodes (chips, AmountText) pass through. */
function renderValue(value: React.ReactNode, style: object, danger?: boolean) {
  if (value == null || value === false) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    return (
      <Text style={[style, danger && { color: colors.expense }]} numberOfLines={1}>
        {value}
      </Text>
    );
  }
  return value;
}

const styles = StyleSheet.create({
  // Geometry matches the incumbent SettingsRow exactly, so that component can
  // delegate here without moving a single pixel on the ~30 screens using it.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  center: { flex: 1, gap: 2 },
  title: { ...type.body, color: colors.textPrimary },
  subtitle: { ...type.label, color: colors.textMuted },
  // Stacked: a quiet label over a prominent value.
  stackedLabel: { ...type.caption, color: colors.textMuted },
  stackedValue: { ...type.body, color: colors.textPrimary },
  // Inline: the value shrinks before the label does, and is capped so a long
  // value can't squeeze the label out entirely.
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    flexShrink: 1,
    maxWidth: '45%',
  },
  value: { ...type.body, color: colors.textSecondary, flexShrink: 1 },
});
