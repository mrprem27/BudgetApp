import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { colors, radius, space, shadow } from './tokens';

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
};

export function Card({ children, style }: Props) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
});
