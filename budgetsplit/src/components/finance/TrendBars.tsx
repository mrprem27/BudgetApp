import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { colors, type } from '../tokens';
import { formatAxisShort, formatRupeesShort } from '../../lib/money';

type Props = {
  /** Target bar values (already in display units, e.g. ₹). */
  values: number[];
  /** X-axis labels, one per value. */
  labels: string[];
  /** Bar fill colour (changes with the selected category). */
  color: string;
};

/**
 * 6-month trend bars whose HEIGHTS animate when the data changes (e.g. switching
 * category) while the axes stay put.
 *
 * gifted-charts' BarChart only animates on mount — any remount replays the whole
 * axis build, and it has no `animateOnDataChange` (LineChart only). So we render
 * static bars and tween the values ourselves: the y-scale (`maxValue`) is derived
 * from the TARGET values so it's fixed for the whole tween, and the x-axis labels
 * are constant — only the bar heights move.
 */
export function TrendBars({ values, labels, color }: Props) {
  const max = Math.max(1, ...values);
  const [display, setDisplay] = useState<number[]>(() => values.map(() => 0));
  const fromRef = useRef<number[]>([]);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const from = fromRef.current;
    const to = values;
    anim.stopAnimation();
    anim.setValue(0);
    const id = anim.addListener(({ value }) => {
      const next = to.map((t, i) => {
        const f = from[i] ?? 0;
        return f + (t - f) * value;
      });
      fromRef.current = next;
      setDisplay(next);
    });
    Animated.timing(anim, {
      toValue: 1,
      duration: 350,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start(({ finished }) => {
      anim.removeListener(id);
      if (finished) { fromRef.current = to; setDisplay(to); }
    });
    return () => anim.removeListener(id);
  }, [values, anim]);

  const data = labels.map((label, i) => ({ value: display[i] ?? 0, label, frontColor: color }));

  return (
    <BarChart
      // Static bars — heights come straight from `data` each render; we drive the
      // animation via `display` above so the axes never re-animate.
      data={data}
      height={140}
      barWidth={22}
      spacing={18}
      initialSpacing={12}
      endSpacing={8}
      roundedTop
      noOfSections={3}
      maxValue={Math.ceil(max * 1.15)}
      xAxisThickness={0}
      yAxisThickness={0}
      yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
      formatYLabel={formatAxisShort}
      xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 9 }}
      hideRules
      disableScroll
      // Tap a bar to reveal its exact amount (uses the target value, not the
      // mid-animation display value).
      focusBarOnPress
      renderTooltip={(_item: unknown, index: number) => (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipText}>{formatRupeesShort((values[index] ?? 0) * 100)}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  tooltip: {
    backgroundColor: colors.bgCard,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 6,
    marginLeft: -8,
  },
  tooltipText: { ...type.caption, color: colors.textPrimary, fontFamily: 'SpaceMono_400Regular' },
});
