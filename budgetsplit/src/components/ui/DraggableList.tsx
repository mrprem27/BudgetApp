import React, { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, runOnJS, type SharedValue,
} from 'react-native-reanimated';
import { haptic } from '../../lib/haptics';

type Props<T> = {
  data: T[];
  keyExtractor: (item: T) => string;
  /** Render a row; `isActive` is true while it's being dragged. */
  renderItem: (item: T, isActive: boolean) => React.ReactNode;
  /** Called with the new id order once a drag settles. */
  onReorder: (orderedIds: string[]) => void;
  /** Fixed vertical gap between rows (px). */
  gap?: number;
  longPressMs?: number;
};

/**
 * Long-press to pick a row up, drag to reorder — Reanimated v4 + gesture-handler.
 * Rows are in NORMAL FLOW (no absolute `top`), so they never share a coordinate →
 * no border-doubling flicker. While dragging, neighbours animate (withTiming) to
 * make room; on release the shift snaps to 0 instantly AND the data reorders — the
 * two cancel out (a row's new flow slot == where it already sat), so the drop is
 * seamless with no jump. `activateAfterLongPress` keeps plain swipes scrolling.
 */
export function DraggableList<T>({ data, keyExtractor, renderItem, onReorder, gap = 16, longPressMs = 220 }: Props<T>) {
  const [order, setOrder] = useState<T[]>(data);
  const [rowH, setRowH] = useState(0);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const active = useSharedValue(-1); // index being dragged
  const hover = useSharedValue(-1);  // index it would drop into
  const dragY = useSharedValue(0);

  // Re-sync with the parent when it changes data, but never mid-drag.
  useEffect(() => { if (activeKey === null) setOrder(data); }, [data, activeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const slot = rowH + gap;
  const n = order.length;

  const onPickup = (key: string) => { haptic.light(); setActiveKey(key); };
  const onDrop = (from: number, to: number) => {
    if (from !== to && to >= 0 && to < order.length) {
      const next = order.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setOrder(next);
      haptic.selection();
      onReorder(next.map(keyExtractor));
    }
    setActiveKey(null);
    active.value = -1;
    hover.value = -1;
    dragY.value = 0;
  };

  return (
    <View>
      {order.map((item, i) => (
        <Row
          key={keyExtractor(item)}
          index={i}
          count={n}
          slot={slot}
          gap={i === n - 1 ? 0 : gap}
          enabled={rowH > 0}
          longPressMs={longPressMs}
          active={active}
          hover={hover}
          dragY={dragY}
          onPickup={() => onPickup(keyExtractor(item))}
          onDrop={onDrop}
          onMeasure={i === 0 && rowH === 0 ? (h: number) => setRowH(h) : undefined}
        >
          {renderItem(item, keyExtractor(item) === activeKey)}
        </Row>
      ))}
    </View>
  );
}

function Row({
  index, count, slot, gap, enabled, longPressMs, active, hover, dragY, onPickup, onDrop, onMeasure, children,
}: {
  index: number;
  count: number;
  slot: number;
  gap: number;
  enabled: boolean;
  longPressMs: number;
  active: SharedValue<number>;
  hover: SharedValue<number>;
  dragY: SharedValue<number>;
  onPickup: () => void;
  onDrop: (from: number, to: number) => void;
  onMeasure?: (h: number) => void;
  children: React.ReactNode;
}) {
  const pan = Gesture.Pan()
    .enabled(enabled)
    .activateAfterLongPress(longPressMs)
    .onStart(() => {
      active.value = index;
      hover.value = index;
      dragY.value = 0;
      runOnJS(onPickup)();
    })
    .onUpdate((e) => {
      dragY.value = e.translationY;
      hover.value = Math.min(count - 1, Math.max(0, index + Math.round(e.translationY / slot)));
    })
    .onEnd(() => {
      runOnJS(onDrop)(index, hover.value);
    });

  const aStyle = useAnimatedStyle(() => {
    const a = active.value;
    if (a === index) {
      // The dragged row tracks the finger 1:1.
      return { transform: [{ translateY: dragY.value }, { scale: 1.03 }], zIndex: 20 };
    }
    const h = hover.value;
    let shift = 0;
    if (a !== -1) {
      if (a < h && index > a && index <= h) shift = -slot;
      else if (a > h && index >= h && index < a) shift = slot;
    }
    // Animate make-room WHILE dragging; snap instantly on release (a === -1) so the
    // transform reset and the data reorder cancel — seamless, no flicker.
    return {
      transform: [{ translateY: a === -1 ? shift : withTiming(shift, { duration: 160 }) }],
      zIndex: 0,
    };
  });

  return (
    <Animated.View
      style={[{ marginBottom: gap }, aStyle]}
      onLayout={onMeasure ? (e: LayoutChangeEvent) => onMeasure(e.nativeEvent.layout.height) : undefined}
    >
      <GestureDetector gesture={pan}>
        <Animated.View>{children}</Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}
