import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space } from '../tokens';

type Props = {
  /** Muted hint shown beside the label when collapsed, e.g. "Split · Attach". */
  hint?: string;
  /** Force the section open (e.g. while editing) regardless of toggle state. */
  forceOpen?: boolean;
  children: React.ReactNode;
};

/** Collapsible "More options" disclosure (chevron + label + hint). */
export function MoreOptions({ hint, forceOpen = false, children }: Props) {
  const [open, setOpen] = useState(false);
  const expanded = open || forceOpen;
  return (
    <>
      {!forceOpen && (
        <TouchableOpacity
          style={styles.toggle}
          onPress={() => setOpen(v => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel="More options"
        >
          <Feather name={expanded ? 'chevron-down' : 'chevron-right'} size={16} color={colors.textSecondary} />
          <Text style={styles.label}>More options</Text>
          {!expanded && !!hint && <Text style={styles.hint}>{hint}</Text>}
        </TouchableOpacity>
      )}
      {expanded && children}
    </>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: space.xs },
  label: { ...type.body, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  hint: { ...type.caption, color: colors.textMuted, marginLeft: space.xs },
});
