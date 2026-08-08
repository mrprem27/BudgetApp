import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PressableScale } from './PressableScale';
import { colors, type, space, radius, layout } from '../tokens';
import { alpha } from '../../theme';

type Props = {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  /** Leading node — an emoji disc, an `IconCircle`, an avatar. */
  leading?: React.ReactNode;
  /** Tint for the selected border and check. Defaults to `colors.accent`. */
  accent?: string;
};

/**
 * A full-width, single-select option row: content on the left, a radio on the right.
 *
 * The radio sits on the **right** deliberately — it's the last thing you look at,
 * confirming the choice you just read, and it puts every row's indicator in one
 * vertical line that's easy to scan for "which one is on".
 *
 * Selected state is a tinted border plus a filled check, not a background swap alone:
 * colour-only selection fails for anyone who can't distinguish the two fills, and the
 * check is the redundant signal.
 *
 * Lives in `ui/` rather than the onboarding folder because it carries no domain
 * knowledge — it replaces onboarding's hand-rolled `intentCard`/`intentEmoji`/
 * `intentCheck` trio, and the same shape is wanted in the Review and Settings sheets.
 */
export function OptionRow({
  label, description, selected, onPress, leading, accent = colors.accent,
}: Props) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={{ selected }}
    >
      <View style={[styles.row, selected && { borderColor: accent, backgroundColor: alpha(accent, 8) }]}>
        {leading}
        <View style={styles.center}>
          <Text style={styles.label}>{label}</Text>
          {!!description && <Text style={styles.description}>{description}</Text>}
        </View>
        <View style={[styles.radio, selected ? { backgroundColor: accent, borderColor: accent } : null]}>
          {selected && <Feather name="check" size={13} color={colors.bg} />}
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: layout.rowMinHeight,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  center: { flex: 1, gap: 2 },
  label: { ...type.bodySemi, color: colors.textPrimary },
  description: { ...type.caption, color: colors.textSecondary },
  radio: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
