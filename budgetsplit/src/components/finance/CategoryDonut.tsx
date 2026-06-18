import React, { useRef, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { colors, type, space, radius } from '../tokens';
import { formatCompact } from '../../lib/money';
import { computeDonutWedges, type DonutSeg, type DonutWedge } from '../../lib/donut';

const AG = Animated.createAnimatedComponent(G as any);

// SVG geometry — matches BudgetSplit Design System (2) CategoryDonut spec
const CX = 100, CY = 100, RO = 88, RI = 60, GAP = 2.2;
const SEL_RO = RO + 4;   // selected wedge outer radius
const POP = 7;            // translate distance (SVG units) on selection
const DIM = 0.32;         // non-selected segment opacity
const SVG_SIZE = 220;

export type { DonutSeg };

function ptOnRing(r: number, deg: number): [number, number] {
  const a = (deg - 90) * Math.PI / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function wedgePath(s: DonutWedge, selected: boolean): string {
  const ro = selected ? SEL_RO : RO;
  const large = s.a1 - s.a0 > 180 ? 1 : 0;
  const [x0, y0] = ptOnRing(ro, s.a0);
  const [x1, y1] = ptOnRing(ro, s.a1);
  const [x2, y2] = ptOnRing(RI, s.a1);
  const [x3, y3] = ptOnRing(RI, s.a0);
  return [
    `M${x0.toFixed(2)} ${y0.toFixed(2)}`,
    `A${ro} ${ro} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `L${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `A${RI} ${RI} 0 ${large} 0 ${x3.toFixed(2)} ${y3.toFixed(2)}`,
    'Z',
  ].join(' ');
}

type Props = {
  data: DonutSeg[];
  total: number;
  onOpen: (seg: DonutSeg) => void;
};

export function CategoryDonut({ data, total, onOpen }: Props) {
  const [sel, setSel] = useState<number | null>(null);
  const segs = useMemo(() => computeDonutWedges(data, total, { gap: GAP }), [data, total]);

  const opacityRefs = useRef<Animated.Value[]>([]);

  // Sync animation ref count to segment count — safe to do during render for refs
  if (opacityRefs.current.length !== segs.length) {
    opacityRefs.current = segs.map(() => new Animated.Value(1));
  }

  // Reset stale selection when segment count changes (data reload)
  useEffect(() => {
    if (sel !== null && sel >= segs.length) setSel(null);
  }, [segs.length]);

  // Drive opacity animation whenever selection changes
  useEffect(() => {
    const anims = opacityRefs.current.map((anim, i) =>
      Animated.timing(anim, {
        toValue: sel === null ? 1 : sel === i ? 1 : DIM,
        duration: 220,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
    );
    Animated.parallel(anims).start();
  }, [sel]);

  const selected = sel !== null && sel < segs.length ? segs[sel] : null;

  function handleWedgePress(i: number) {
    if (sel === i) {
      onOpen(segs[i]);
    } else {
      setSel(i);
    }
  }

  if (!segs.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No spending this period</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.svgWrap}>
        <Svg width={SVG_SIZE} height={SVG_SIZE} viewBox="-10 -10 220 220">
          {segs.map((seg, i) => {
            const anim = opacityRefs.current[i];
            if (!anim) return null;
            const isSel = sel === i;
            const midRad = (seg.mid - 90) * Math.PI / 180;
            const tx = (Math.cos(midRad) * POP).toFixed(2);
            const ty = (Math.sin(midRad) * POP).toFixed(2);
            return (
              <AG key={seg.name} opacity={anim}>
                <G
                  transform={isSel ? `translate(${tx},${ty})` : undefined}
                  onPress={() => handleWedgePress(i)}
                >
                  <Path d={wedgePath(seg, isSel)} fill={seg.color} />
                </G>
              </AG>
            );
          })}
        </Svg>

        {/* Floating center overlay — box-none so SVG receives touches behind empty area */}
        <View style={styles.center} pointerEvents="box-none">
          {selected ? (
            <TouchableOpacity style={styles.centerContent} onPress={() => onOpen(selected)}>
              <View style={styles.dotRow}>
                <View style={[styles.dot, { backgroundColor: selected.color }]} />
                <Text style={styles.catName} numberOfLines={1}>{selected.name}</Text>
              </View>
              <Text style={styles.centerAmt}>{formatCompact(selected.paise)}</Text>
              <Text style={styles.viewLink}>{selected.pct}% · View →</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.centerContent} pointerEvents="none">
              <Text style={styles.spentLabel}>SPENT</Text>
              <Text style={styles.centerAmt}>{formatCompact(total)}</Text>
              <Text style={styles.tapHint}>tap a slice</Text>
            </View>
          )}
        </View>
      </View>

      {/* Quick-pick chips */}
      <View style={styles.chips}>
        {segs.map((seg, i) => {
          const on = sel === i;
          return (
            <TouchableOpacity
              key={seg.name}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => setSel(on ? null : i)}
            >
              <View style={[styles.chipDot, { backgroundColor: seg.color }]} />
              <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                {seg.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  svgWrap: { width: SVG_SIZE, height: SVG_SIZE, position: 'relative' },
  center: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  centerContent: { alignItems: 'center', paddingHorizontal: 28 },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  catName: { ...type.caption, color: colors.textSecondary, maxWidth: 84 },
  centerAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 24, letterSpacing: -0.5, color: colors.textPrimary },
  viewLink: { ...type.caption, color: colors.accent, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  spentLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  tapHint: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: space.md },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill },
  chipOn: { backgroundColor: colors.bgMuted },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { ...type.caption, color: colors.textSecondary },
  chipTextOn: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  empty: { height: 80, alignItems: 'center', justifyContent: 'center' },
  emptyText: { ...type.body, color: colors.textMuted },
});
