import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { type, colors } from '../tokens';

type Props = {
  name: string;
  color: string;
  size?: number;
  onPress?: () => void;
  selected?: boolean;
  /** Optional photo; when set it replaces the colored initials circle. */
  imageUri?: string | null;
};

export function MemberAvatar({ name, color, size = 40, onPress, selected, imageUri }: Props) {
  // Robust to empty / whitespace-only / multi-space names (DB-derived).
  const initials =
    (name ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0])
      .join('')
      .toUpperCase() || '?';

  const content = (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        selected && { borderWidth: 2, borderColor: colors.accent },
      ]}
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials}</Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={name}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },
});
