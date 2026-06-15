import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { type, colors } from '../tokens';

type Props = {
  name: string;
  color: string;
  size?: number;
  onPress?: () => void;
  selected?: boolean;
};

export function MemberAvatar({ name, color, size = 40, onPress, selected }: Props) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  const content = (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        selected && { borderWidth: 2, borderColor: colors.accent },
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials}</Text>
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
