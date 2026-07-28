import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../tokens';

/**
 * A Feather icon in a tinted circular disc — the most-repeated visual primitive
 * in the app (~40 hand-rolled copies before this existed).
 *
 * AGENTS.md §8 documents the shape as an inline snippet:
 *
 *   <View style={{ width: 36, height: 36, borderRadius: 18,
 *                  backgroundColor: color + '22', ... }}>
 *     <Feather name={icon} size={18} color={color} />
 *   </View>
 *
 * Use this component instead. The defaults reproduce that snippet exactly:
 * the disc is `size`, the icon is half of it, and the background is the icon
 * colour at ~13% (`'22'`). Override `bg` for a token background such as
 * `colors.bgMuted` / `colors.accentMuted`.
 */
export function IconCircle({
  icon,
  size = 36,
  color = colors.accent,
  bg,
  borderColor,
  iconSize,
  style,
}: {
  icon: keyof typeof Feather.glyphMap;
  /** Diameter in px. The icon defaults to half this. */
  size?: number;
  /** Icon colour; also drives the default background tint. */
  color?: string;
  /** Background override. Defaults to `color + '22'` per AGENTS.md §8. */
  bg?: string;
  /** Optional 1px ring. */
  borderColor?: string;
  /** Icon size override; defaults to `size / 2`. */
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg ?? color + '22',
          ...(borderColor ? { borderWidth: 1, borderColor } : null),
        },
        style,
      ]}
    >
      <Feather name={icon} size={iconSize ?? Math.round(size / 2)} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
