import React from 'react';
import { View } from 'react-native';
import { Chip } from '../../ui/Chip';
import { colors } from '../../tokens';

/**
 * Days in a row you've logged something, as a small ⚡ chip beside your name on Home. Shown from two
 * days — one day is not a streak. The full calendar card stays opt-in (Settings › Sections).
 */
export function StreakBadge({ days }: { days: number }) {
  if (days < 2) return null;
  return (
    <View accessible accessibilityLabel={`${days}-day logging streak`}>
      <Chip icon="zap" label={String(days)} selected accent={colors.healthAmber} />
    </View>
  );
}
