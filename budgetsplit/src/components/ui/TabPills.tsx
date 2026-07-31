import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { colors, type, space, radius } from '../tokens';
import { haptic } from '../../lib/haptics';

type Tab = { key: string; label: string };

type Props = {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
};

/**
 * Segmented pill tab bar with a sliding accent indicator.
 *
 * The previous implementation re-tinted the active pill in place, which
 * caused a hard-cut swap on every change (visually jumpy at 60fps).
 * Now the active fill is a single animated View that slides beneath the
 * pills — the pattern iOS uses in Settings and every modern segmented
 * control. Labels crossfade colour independently.
 */
export function TabPills({ tabs, active, onChange }: Props) {
  const activeIndex = Math.max(0, tabs.findIndex(t => t.key === active));
  const slide = useRef(new Animated.Value(activeIndex)).current;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: activeIndex,
      useNativeDriver: false, // width/left animations
      speed: 30,
      bounciness: 4,
    }).start();
  }, [activeIndex, slide]);

  if (tabs.length === 0) return null;

  const widthPct = 100 / tabs.length;
  const leftPct = slide.interpolate({
    inputRange: tabs.map((_, i) => i),
    outputRange: tabs.map((_, i) => `${i * widthPct}%`),
  });

  return (
    <View style={styles.track}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicator,
          { width: `${widthPct}%`, left: leftPct as unknown as string },
        ]}
      />
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <TouchableOpacity
            key={t.key}
            style={styles.pill}
            onPress={() => {
              if (!isActive) haptic.selection();
              onChange(t.key);
            }}
            hitSlop={{ top: 6, bottom: 6 }}
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
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  pill: {
    flex: 1,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
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
