import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, type, space, radius } from '../tokens';

type Tab = {
  key: string;
  label: string;
};

type Props = {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
};

/**
 * Shared pill-style tab bar used across dashboard, group detail, and
 * anywhere a segmented choice is needed. bgMuted track, accent active fill.
 */
export function TabPills({ tabs, active, onChange }: Props) {
  return (
    <View style={styles.track}>
      {tabs.map(t => {
        const isActive = t.key === active;
        return (
          <TouchableOpacity
            key={t.key}
            style={[styles.pill, isActive && styles.pillActive]}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.bgMuted,
    borderRadius: radius.pill,
    padding: 3,
  },
  pill: {
    flex: 1,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: colors.accent,
  },
  label: {
    ...type.label,
    color: colors.textSecondary,
    fontFamily: 'Inter_600SemiBold',
  },
  labelActive: {
    color: colors.bg,
  },
});
