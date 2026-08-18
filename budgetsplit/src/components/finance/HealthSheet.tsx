import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { colors, type, space, layout } from '../tokens';
import { SheetModal } from '../ui/SheetModal';
import { Card } from '../ui/Card';
import { Divider } from '../ui/Divider';
import { SectionHeader } from '../ui/SectionHeader';
import { AnimatedBar } from '../ui/anim/AnimatedBar';
import { SampleNote } from './SampleNote';
import { suggestImprovement, type HealthResult, type HealthInputs } from '../../lib/financialHealth';
import { healthBandColor, healthBandLabel, sevColor } from './home/helpers';

type Props = {
  visible: boolean;
  onClose: () => void;
  result: HealthResult | null;
  inputs?: HealthInputs | null;
  /** Transactions the active period's score was computed from — surfaced so a
   *  score built from very little data doesn't read as more certain than it is. */
  txnCount?: number;
  /** e.g. "today" / "this month" / "this year" — matches the active Home tab. */
  periodLabel?: string;
};

const R = 50;
const CIRC = 2 * Math.PI * R;

/**
 * Money-health detail sheet: score ring + per-dimension bars + factor list.
 * Built entirely from the `HealthResult` already computed on Home.
 *
 * The dimensions are **full-width rows**, not a three-across grid. They were three
 * `flex: 1` cards each holding an 11px uppercase label with extra letter-spacing over a
 * **3px** track — at that width the labels are cramped and a 3px bar is below the visual
 * floor for a meter, which is what made this sheet feel tight. As rows the label sits
 * beside its bar, the bar gets the full width, and the score reads at the end.
 */
export function HealthSheet({ visible, onClose, result, inputs, txnCount = 0, periodLabel = 'this month' }: Props) {
  const improvement = result && inputs ? suggestImprovement(inputs, result) : null;

  // Minimum-data gate (financialHealth.ts): below it there is no number at
  // all — just the checklist of what unlocks one. Showing a score computed
  // from silence is exactly the "59/Fair on an empty app" this replaces.
  if (result && !result.gate.ok) {
    return (
      <SheetModal visible={visible} onClose={onClose} title="Money Health">
        <View style={styles.gateHead}>
          <Text style={styles.gateTitle}>Building your score</Text>
          <Text style={styles.gateBody}>
            Your score is computed from your real ledger — it unlocks once there&apos;s enough
            data to be honest about it.
          </Text>
        </View>
        <Card clip>
          {result.gate.needs.map((n, i) => (
            <View key={n.label}>
              {i > 0 && <Divider indent="none" />}
              <View style={styles.gateRow}>
                <Feather
                  name={n.done ? 'check-circle' : 'circle'}
                  size={18}
                  color={n.done ? colors.income : colors.textMuted}
                />
                <Text style={[styles.gateLabel, n.done && styles.gateDone]}>{n.label}</Text>
              </View>
            </View>
          ))}
        </Card>
      </SheetModal>
    );
  }

  return (
    <SheetModal visible={visible} onClose={onClose} title="Money Health">
      {result && (
        <>
          {/* The one hero figure (AGENTS §1). */}
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

          <SampleNote txnCount={txnCount} periodLabel={periodLabel} style={styles.sampleNote} />

          <Card clip>
            {result.dimensions.map((dim, i) => {
              const dc = sevColor(dim.severity);
              return (
                <View key={dim.label}>
                  {i > 0 && <Divider indent="none" />}
                  <View style={styles.dimRow}>
                    <Text style={styles.dimLabel} numberOfLines={1}>{dim.label}</Text>
                    <View style={styles.dimBar}>
                      <AnimatedBar
                        progress={dim.pct / 100}
                        color={dc}
                        height={6}
                        accessibilityLabel={`${dim.label}: ${dim.score} of ${dim.max}`}
                      />
                    </View>
                    <Text style={[styles.dimScore, { color: dc }]}>
                      {dim.score}<Text style={styles.dimMax}>/{dim.max}</Text>
                    </Text>
                  </View>
                </View>
              );
            })}
          </Card>

          <SectionHeader title="What's driving this" />
          <Card clip>
            {result.factors.map((f, i) => {
              const fc = sevColor(f.severity);
              return (
                <View key={f.label}>
                  {i > 0 && <Divider indent="none" />}
                  <View style={styles.factorRow}>
                    <View style={[styles.dot, { backgroundColor: fc }]} />
                    <View style={styles.factorMid}>
                      <Text style={styles.factorLabel}>{f.label}</Text>
                      <Text style={styles.factorDetail}>{f.detail}</Text>
                    </View>
                    <Text style={[styles.factorPts, { color: fc }]}>{f.points}/{f.max}</Text>
                  </View>
                </View>
              );
            })}
          </Card>

          {/* Biggest improvement — projection recomputed from the real formula.
              When from and to are equal the engine is naming the weakest factor
              without projecting a gain (see `suggestImprovement`), so the score
              row is omitted rather than rendering "47 → 47". */}
          {improvement && (
            <Card padded style={styles.improveCard}>
              <View style={styles.improveRow}>
                <View style={[styles.dot, { backgroundColor: colors.income }]} />
                <View style={styles.factorMid}>
                  <Text style={styles.improveTitle}>{improvement.title}</Text>
                  <Text style={styles.factorDetail}>{improvement.detail}</Text>
                  {improvement.toScore > improvement.fromScore && (
                    <View style={styles.improveScoreRow}>
                      <Text style={styles.improveFrom}>{improvement.fromScore}</Text>
                      <Feather name="arrow-right" size={14} color={colors.income} />
                      <Text style={styles.improveTo}>{improvement.toScore}</Text>
                    </View>
                  )}
                </View>
              </View>
            </Card>
          )}
        </>
      )}
    </SheetModal>
  );
}

const DOT = 8;

const styles = StyleSheet.create({
  gateHead: { marginBottom: space.md },
  gateTitle: { ...type.subheading, color: colors.textPrimary, marginBottom: space.xs },
  gateBody: { ...type.body, color: colors.textSecondary },
  gateRow: { flexDirection: 'row', alignItems: 'center', gap: space.smd, paddingVertical: space.smd, paddingHorizontal: space.md, minHeight: layout.rowMinHeight },
  gateLabel: { ...type.body, color: colors.textPrimary, flex: 1 },
  gateDone: { color: colors.textSecondary },
  ringWrap: { width: 120, height: 120, alignSelf: 'center', marginBottom: space.lg },
  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  ringScore: { ...type.amountXL, color: colors.textPrimary },
  ringBand: { ...type.captionSemi, marginTop: 2 },
  // Position only — SampleNote owns the type, colour and low-sample tone.
  sampleNote: { marginTop: -space.sm, marginBottom: space.lg },

  dimRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, minHeight: layout.rowMinHeight },
  dimLabel: { ...type.body, color: colors.textPrimary, width: 76 },
  dimBar: { flex: 1 },
  dimScore: { ...type.amountSM, minWidth: 46, textAlign: 'right' },
  dimMax: { ...type.caption, color: colors.textMuted },

  factorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.smd, padding: space.md },
  factorMid: { flex: 1 },
  factorLabel: { ...type.labelSemi, color: colors.textPrimary, marginBottom: 2 },
  factorDetail: { ...type.caption, color: colors.textSecondary, lineHeight: 16 },
  factorPts: { ...type.amountSM },
  // One dot shape. Both copies of this were 7×7 with `borderRadius: 4` — half of 7 is
  // 3.5, so they rendered very slightly squared.
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, marginTop: 5 },

  improveCard: { marginTop: space.md, backgroundColor: colors.incomeTint, borderColor: colors.incomeTintStrong },
  improveRow: { flexDirection: 'row', gap: space.smd },
  improveTitle: { ...type.labelSemi, color: colors.income, marginBottom: 3 },
  improveScoreRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  improveFrom: { ...type.amountSM, color: colors.textMuted },
  improveTo: { ...type.amountMD, color: colors.income },
});
