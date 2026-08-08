import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, type, radius } from '../tokens';

type Tab = {
  key: string;
  label: string;
};

type Props = {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
  /**
   * Fill colour of the active pill. Defaults to `colors.accent`.
   *
   * Exists so a control can carry the meaning of what it selects — the Add
   * screen tints itself by transaction kind (expense / income / settlement), and
   * the switcher needs to agree with the rest of the form.
   */
  activeColor?: string;
  /**
   * `'sm'` (36pt pills) for a secondary segmented choice inside a screen.
   * `'lg'` (56pt overall) for a control that is the primary decision on the
   * screen — big enough to hit without aiming (AGENTS.md §6).
   */
  size?: 'sm' | 'lg';
};

/**
 * Shared pill-style tab bar used across dashboard, group detail, and anywhere a
 * segmented choice is needed. `bgMuted` track, accent active fill.
 */
export function TabPills({ tabs, active, onChange, activeColor = colors.accent, size = 'sm' }: Props) {
  if (tabs.length === 0) return null;
  const lg = size === 'lg';
  return (
    <View style={[styles.track, lg && styles.trackLg]}>
      {tabs.map(t => {
        const isActive = t.key === active;
        return (
          <TouchableOpacity
            key={t.key}
            style={[styles.pill, lg && styles.pillLg, isActive && { backgroundColor: activeColor }]}
            onPress={() => onChange(t.key)}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[styles.label, lg && styles.labelLg, isActive && styles.labelActive]}>
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
  trackLg: { padding: 4 },
  pill: {
    flex: 1,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLg: { height: 48 },
  label: { ...type.labelSemi, color: colors.textSecondary },
  labelLg: { ...type.button },
  labelActive: { color: colors.bg },
});
