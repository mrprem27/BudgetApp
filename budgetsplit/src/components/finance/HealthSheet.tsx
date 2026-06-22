import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { SheetModal } from '../ui/SheetModal';
import type { HealthResult } from '../../lib/financialHealth';
import { healthBandColor, healthBandLabel, sevColor } from './home/helpers';

type Props = {
  visible: boolean;
  onClose: () => void;
  result: HealthResult | null;
};

const R = 50;
const CIRC = 2 * Math.PI * R;

/**
 * Money-health detail sheet: score ring + per-dimension bars + factor list.
 * Built entirely from the HealthResult already computed on Home.
 */
export function HealthSheet({ visible, onClose, result }: Props) {
  return (
    <SheetModal visible={visible} onClose={onClose} title="Money Health">
      {result && (
        <>
          {/* Score ring */}
          <View style={styles.ringWrap}>
            <Svg width={120} height={120} viewBox="0 0 120 120">
              <Circle cx={60} cy={60} r={R} stroke={colors.bgElevated} strokeWidth={8} fill="none" />
              <Circle
                cx={60} cy={60} r={R}
                stroke={healthBandColor(result.band)} strokeWidth={8} fill="none"
                strokeDasharray={`${CIRC} ${CIRC}`}
                strokeDashoffset={CIRC * (1 - result.score / 100)}
                strokeLinecap="round"
                rotation={-90}
                origin="60, 60"
              />
            </Svg>
            <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>
              <Text style={styles.ringScore}>{result.score}</Text>
              <Text style={[styles.ringBand, { color: healthBandColor(result.band) }]}>{healthBandLabel(result.band)}</Text>
            </View>
          </View>

          {/* Dimension bars */}
          <View style={styles.dimRow}>
            {result.dimensions.map(dim => {
              const dc = sevColor(dim.severity);
              return (
                <View key={dim.label} style={styles.dim}>
                  <Text style={styles.dimLabel}>{dim.label}</Text>
                  <View style={styles.dimTrack}>
                    <View style={[styles.dimFill, { width: `${dim.pct}%`, backgroundColor: dc }]} />
                  </View>
                  <Text style={[styles.dimScore, { color: dc }]}>
                    {dim.score}<Text style={styles.dimMax}>/{dim.max}</Text>
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Factors */}
          <Text style={styles.factorsLabel}>WHAT'S DRIVING THIS</Text>
          <View style={styles.factorCard}>
            {result.factors.map((f, i) => {
              const fc = sevColor(f.severity);
              return (
                <View key={f.label} style={[styles.factorRow, i < result.factors.length - 1 && styles.factorBorder]}>
                  <View style={[styles.factorDot, { backgroundColor: fc }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.factorLabel}>{f.label}</Text>
                    <Text style={styles.factorDetail}>{f.detail}</Text>
                  </View>
                  <Text style={[styles.factorPts, { color: fc }]}>{f.points}/{f.max}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  ringWrap: { width: 120, height: 120, alignSelf: 'center', marginBottom: space.lg },
  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  ringScore: { fontFamily: 'SpaceMono_400Regular', fontSize: 28, color: colors.textPrimary, letterSpacing: -1 },
  ringBand: { ...type.caption, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  dimRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.lg },
  dim: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, padding: space.sm + 2, alignItems: 'center', borderWidth: 1, borderColor: colors.border, gap: space.sm },
  dimLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: 'Inter_600SemiBold' },
  dimTrack: { width: '100%', height: 3, backgroundColor: colors.bgElevated, borderRadius: 2 },
  dimFill: { height: 3, borderRadius: 2 },
  dimScore: { fontFamily: 'SpaceMono_400Regular', fontSize: 14 },
  dimMax: { ...type.caption, color: colors.textMuted, fontFamily: 'Inter_400Regular' },
  factorsLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: space.sm, fontFamily: 'Inter_600SemiBold' },
  factorCard: { backgroundColor: colors.bg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  factorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, padding: space.md },
  factorBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  factorDot: { width: 7, height: 7, borderRadius: 4, marginTop: 5 },
  factorLabel: { ...type.label, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  factorDetail: { ...type.caption, color: colors.textSecondary, lineHeight: 16 },
  factorPts: { fontFamily: 'SpaceMono_400Regular', fontSize: 11 },
});
