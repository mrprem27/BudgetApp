import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type StyleProp, type TextStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space } from '../tokens';

type Props = {
  label: string;
  labelStyle?: StyleProp<TextStyle>;
  /** The explanation — one line or several; hidden until the ⓘ is tapped. */
  info: React.ReactNode;
  /** Centres the label and the revealed text (hero cards). */
  center?: boolean;
  /** Extra content shown beside the label, before the ⓘ (a badge, a count). */
  accessibilityLabel?: string;
};

/**
 * A label with its explanation tucked behind an ⓘ.
 *
 * Explanations under every figure made screens read as paragraphs (AGENTS.md §14): the
 * number and its name are the answer, and *why* is for whoever asks. Tapping the ⓘ
 * reveals the text right beneath the label, in place — no popover or nested modal, so
 * it is safe inside a `SheetModal` (nested modals fight over `lib/sheetStage.ts`).
 *
 * The ⓘ is a 44pt hit target around a 14pt glyph, and announces expanded/collapsed.
 */
export function InfoLabel({ label, labelStyle, info, center, accessibilityLabel }: Props) {
  const [open, setOpen] = useState(false);
  // The ⓘ sits in a box one text line tall, aligned to the TOP of the label (`U-56`). Centring it
  // on the row put it halfway down a label that wrapped, and every caller's own label style (a
  // caption, a section label, a heading) moved it a different distance off the text it explains.
  const line = StyleSheet.flatten([styles.label, labelStyle]).lineHeight ?? ICON;
  return (
    <View style={center && styles.center}>
      <View style={styles.row}>
        <Text style={[styles.label, labelStyle]}>{label}</Text>
        <TouchableOpacity
          onPress={() => setOpen(o => !o)}
          hitSlop={{ top: 12, bottom: 12, left: 6, right: 12 }}
          style={[styles.icon, { height: Math.max(line, ICON) }]}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? `About ${label}`}
          accessibilityState={{ expanded: open }}
        >
          <Feather name="info" size={ICON} color={open ? colors.accent : colors.textMuted} />
        </TouchableOpacity>
      </View>
      {open && (typeof info === 'string'
        ? <Text style={[styles.info, center && styles.infoCenter]}>{info}</Text>
        : info)}
    </View>
  );
}

const ICON = 14;

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  icon: { justifyContent: 'center' },
  label: { ...type.body, color: colors.textPrimary, flexShrink: 1 },
  info: { ...type.caption, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  infoCenter: { textAlign: 'center' },
});
