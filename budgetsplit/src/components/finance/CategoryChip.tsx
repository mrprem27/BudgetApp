import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, radius, space, layout } from '../tokens';
import { asFeather } from '../../constants/palette';
import type { Category } from '../../db/queries/categories';

type Props = {
  category: Category;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
};

export function CategoryChip({ category, selected, onPress, style }: Props) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.selected, style]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={category.name}
      accessibilityState={{ selected }}
    >
      <Feather
        name={asFeather(category.icon, 'tag')}
        size={13}
        color={selected ? colors.bg : (category.color ?? colors.textSecondary)}
      />
      <Text style={[styles.label, selected && styles.selectedLabel]}>
        {category.name}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: colors.bgMuted,
    borderRadius: radius.pill,
    paddingHorizontal: space.smd,
    // §6 floor (was 32). A chip's height is a style choice, not a constraint, and
    // this one is how a category gets picked on the screen people use most.
    minHeight: layout.touchMin,
  },
  selected: {
    backgroundColor: colors.accent,
  },
  label: {
    ...type.label,
    color: colors.textSecondary,
  },
  selectedLabel: {
    color: colors.bg,
    fontFamily: 'Inter_600SemiBold',
  },
});
