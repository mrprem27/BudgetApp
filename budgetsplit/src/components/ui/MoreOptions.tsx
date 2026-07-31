import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { haptic } from '../../lib/haptics';

type Props = {
  /** Muted hint shown beside the label when collapsed, e.g. "Split · Attach". */
  hint?: string;
  /** Force the section open (e.g. while editing) regardless of toggle state. */
  forceOpen?: boolean;
  children: React.ReactNode;
};

/**
 * "More options" disclosure. Refined from the old flat text-only toggle:
 *  - Rotating chevron (was icon-swap flicker).
 *  - Pill-shaped tappable area with subtle background — reads as an intentional
 *    control, not a lost-in-the-form link.
 *  - Selection haptic on toggle.
 */
export function MoreOptions({ hint, forceOpen = false, children }: Props) {
  const [open, setOpen] = useState(false);
  const expanded = open || forceOpen;
  const rot = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(rot, { toValue: expanded ? 1 : 0, useNativeDriver: true, speed: 30, bounciness: 2 }).start();
  }, [expanded, rot]);

  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  return (
    <>
      {!forceOpen && (
        <TouchableOpacity
          style={styles.toggle}
          activeOpacity={0.7}
          onPress={() => { haptic.selection(); setOpen(v => !v); }}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel="More options"
        >
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Feather name="chevron-right" size={16} color={colors.textSecondary} />
          </Animated.View>
          <Text style={styles.label}>More options</Text>
          {!expanded && !!hint && <Text style={styles.hint}>{hint}</Text>}
        </TouchableOpacity>
      )}
      {expanded && children}
    </>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.bgMuted,
    alignSelf: 'flex-start',
  },
  label: { ...type.label, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  hint: { ...type.caption, color: colors.textMuted, marginLeft: space.xs },
});
