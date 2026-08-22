import React, { useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Platform,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { colors, type, radius } from '../tokens';
import { haptic } from '../../lib/haptics';

/** One row. 40pt reads clearly and puts five rows in a sheet without dominating it. */
export const WHEEL_ITEM_H = 40;
/** Odd, so there is a true centre row. */
const VISIBLE = 5;
export const WHEEL_H = WHEEL_ITEM_H * VISIBLE;

type Props = {
  /** Row labels, already formatted ("09", "PM"). Index is the value. */
  options: readonly string[];
  index: number;
  onChange: (index: number) => void;
  /** Screen-reader name for the column ("Hour"). */
  label: string;
  /** Widen a column that holds longer text. */
  width?: number;
};

/**
 * One snapping column of a wheel picker — the iOS-style control, built from a
 * `ScrollView` rather than a native module.
 *
 * The alternative was `@react-native-community/datetimepicker`, and it was
 * rejected for the reason `TimePickerSheet` was dependency-free to begin with: it
 * is a native module, so it needs a prebuild, and the Android port has not been
 * done yet. This is ~60 lines of pure JS that works identically on both.
 *
 * How it works: the content is padded by two rows top and bottom so the first and
 * last option can reach the centre, `snapToInterval` locks scrolling to whole
 * rows, and the selected value is the row sitting in the middle. The highlight
 * band is a sibling overlay with `pointerEvents="none"` — drawing it per row
 * instead would make the rows themselves change appearance mid-scroll.
 */
export function WheelPicker({ options, index, onChange, label, width = 72 }: Props) {
  const ref = useRef<ScrollView>(null);
  // What we last told the parent. Guards the haptic: `onScroll` fires constantly,
  // and firing per frame turns a flick into a buzz.
  const settled = useRef(index);

  // Follow an external change (the sheet reopening on a different value) without
  // animating — an animated jump on mount reads as the control moving by itself.
  useEffect(() => {
    if (index === settled.current) return;
    settled.current = index;
    ref.current?.scrollTo({ y: index * WHEEL_ITEM_H, animated: false });
  }, [index]);

  const settle = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const raw = Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM_H);
    const next = Math.max(0, Math.min(options.length - 1, raw));
    if (next === settled.current) return;
    settled.current = next;
    haptic.selection();
    onChange(next);
  }, [onChange, options.length]);

  return (
    <View style={[styles.col, { width }]}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_H}
        decelerationRate="fast"
        // Both, deliberately. A flick ends in momentum; a slow drag-and-release
        // ends without any, and on Android momentum often never fires at all — so
        // handling only one leaves the column visibly settled on a value the
        // parent was never told about.
        onMomentumScrollEnd={settle}
        onScrollEndDrag={settle}
        contentOffset={{ x: 0, y: index * WHEEL_ITEM_H }}
        contentContainerStyle={styles.content}
        accessibilityLabel={label}
      >
        {options.map((opt, i) => (
          <View key={opt} style={styles.item}>
            <Text style={[styles.text, i === index && styles.textOn]}>{opt}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** The centre band, drawn once across every column that sits inside it. */
export function WheelBand() {
  return <View pointerEvents="none" style={styles.band} />;
}

const PAD = (WHEEL_H - WHEEL_ITEM_H) / 2;

const styles = StyleSheet.create({
  col: { height: WHEEL_H },
  content: { paddingVertical: PAD },
  item: { height: WHEEL_ITEM_H, alignItems: 'center', justifyContent: 'center' },
  // SpaceMono so the digits do not shift width as they scroll past (AGENTS §1:
  // money and numerals are mono).
  text: { ...type.body, fontFamily: 'SpaceMono_400Regular', color: colors.textMuted },
  textOn: { color: colors.textPrimary, fontFamily: 'SpaceMono_400Regular' },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: PAD,
    height: WHEEL_ITEM_H,
    borderRadius: radius.md,
    backgroundColor: colors.bgMuted,
    // Behind the numbers. On Android `zIndex` alone is unreliable inside a
    // sibling stack, so elevation is pinned to 0 too.
    ...Platform.select({ android: { elevation: 0 } }),
  },
});
