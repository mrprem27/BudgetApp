import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { colors, type, space } from '../../tokens';
import { alpha } from '../../../theme';
import { IconCircle } from '../../ui/IconCircle';

/**
 * Full-screen blocking overlay shown while a receipt scan is in flight —
 * device OCR is near-instant but the cloud provider is a real network round
 * trip. Rendered as the LAST sibling on the itemized screen so it paints over
 * everything (header, total card, add-item card) and, being an opaque View on
 * top, blocks every underlying touch for the duration of the scan.
 */
export function ScanningOverlay({ visible }: { visible: boolean }) {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const iconPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;

    const ping = (val: Animated.Value, delay: number) => Animated.loop(
      Animated.sequence([
        Animated.timing(val, { toValue: 1, duration: 1600, delay, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(iconPulse, { toValue: 1.08, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(iconPulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );

    const anims = [ping(ring1, 0), ping(ring2, 800), pulse];
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, [visible, ring1, ring2, iconPulse]);

  if (!visible) return null;

  const ringStyle = (val: Animated.Value) => ({
    opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
    transform: [{ scale: val.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }],
  });

  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.ring, ringStyle(ring1)]} />
      <Animated.View style={[styles.ring, ringStyle(ring2)]} />
      <Animated.View style={{ transform: [{ scale: iconPulse }] }}>
        <IconCircle icon="camera" color={colors.accent} size={72} />
      </Animated.View>
      <Text style={styles.title}>Scanning your receipt…</Text>
      <Text style={styles.subtitle}>This can take a few seconds</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: alpha(colors.bg, 95),
    alignItems: 'center', justifyContent: 'center',
    zIndex: 9999, elevation: 9999,
  },
  ring: {
    position: 'absolute', width: 72, height: 72, borderRadius: 36,
    borderWidth: 2, borderColor: colors.accent,
  },
  title: { ...type.subheading, color: colors.textPrimary, marginTop: space.lg, fontFamily: 'Inter_600SemiBold' },
  subtitle: { ...type.body, color: colors.textSecondary, marginTop: space.xs },
});
