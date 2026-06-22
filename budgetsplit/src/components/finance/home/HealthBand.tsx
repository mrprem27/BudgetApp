import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, shadow } from '../../tokens';
import type { HealthResult } from '../../../lib/financialHealth';
import { healthBandColor, healthBandLabel } from './helpers';

type Props = {
  result: HealthResult;
  onPress: () => void;
};

/** Compact one-line money-health chip on Home; taps open the detail sheet. */
export function HealthBand({ result, onPress }: Props) {
  const color = healthBandColor(result.band);
  // Worst non-good factor drives the subtitle ("what's dragging me down").
  const worst = [...result.factors]
    .filter(f => f.severity === 'bad' || f.severity === 'warn')
    .sort((a, b) => (a.points / a.max) - (b.points / b.max))[0];
  const subtitle = worst ? worst.detail : 'Your money is in good shape';

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: color + '14', borderColor: color + '33' }]}
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Money health ${result.score}, ${healthBandLabel(result.band)}`}
    >
      <View style={[styles.scoreRing, { borderColor: color }]}>
        <Text style={[styles.score, { color }]}>{result.score}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color }]}>{healthBandLabel(result.band)} · Money Health</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Feather name="chevron-right" size={14} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.lg, padding: space.md, marginBottom: space.md, borderWidth: 1, ...shadow.sm },
  scoreRing: { width: 40, height: 40, borderRadius: 20, borderWidth: 2.5, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  score: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, letterSpacing: -0.5 },
  title: { ...type.body, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  subtitle: { ...type.caption, color: colors.textSecondary },
});
