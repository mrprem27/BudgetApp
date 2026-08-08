import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { colors, radius, space, shadow } from '../tokens';

type Props = {
  children: React.ReactNode;
  /** Adds `space.md` of inner padding. Leave off when the card holds `ListRow`s,
   *  which bring their own padding — otherwise the gutter doubles. */
  padded?: boolean;
  /** Clip children to the corner radius. Needed when rows carry their own
   *  background or a divider would otherwise poke past the rounded edge. */
  clip?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * The card surface from AGENTS.md §3 — `bgCard`, 1px `border`, `radius.lg`,
 * `shadow.sm`.
 *
 * §3's rule is that form fields, rows and data must never float bare on the
 * dark background. That rule was widely broken simply because there was nothing
 * to reach for: ~30 sites hand-wrote this same four-property recipe, and the
 * ones that didn't left their content floating.
 */
export function Card({ children, padded, clip, style }: Props) {
  return (
    <View style={[styles.base, padded && styles.padded, clip && styles.clip, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  padded: { padding: space.md },
  clip: { overflow: 'hidden' },
});
