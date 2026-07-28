import React, { useRef, useEffect } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, space } from '../../tokens';
import { alpha } from '../../../theme';

/**
 * The four onboarding feature-carousel illustrations, moved verbatim out of
 * `Onboarding.tsx` (a 961-line file). Each runs only while its slide is
 * `active`, and stops its loop on unmount.
 *
 * NOTE: this is NOT the hero animation. The hero ring/fan lives in
 * `LogoAssembly.tsx` and is deliberately untouched.
 */

export type AnimKind = 'spend' | 'split' | 'budget' | 'privacy';

const ART_SIZE = 156;

/** A coin glyph in a tinted disc — the shared unit for the finance animations. */
function Coin({ tint, size = 40, icon = 'dollar-sign' as keyof typeof Feather.glyphMap }: { tint: string; size?: number; icon?: keyof typeof Feather.glyphMap }) {
  return (
    <View style={[styles.coin, { width: size, height: size, borderRadius: size / 2, backgroundColor: alpha(tint, 15), borderColor: alpha(tint, 33) }]}>
      <Feather name={icon} size={size * 0.5} color={tint} />
    </View>
  );
}

/** ① Coins dropping into a pie — "where it goes". */
function SpendArt({ tint, active }: { tint: string; active: boolean }) {
  const drops = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loops = drops.map((v, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 360),
        Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(900),
      ])),
    );
    const p = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loops.forEach(l => l.start()); p.start();
    return () => { loops.forEach(l => l.stop()); p.stop(); };
  }, [active]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  return (
    <View style={styles.artBox}>
      {drops.map((v, i) => {
        const x = (i - 1) * 34;
        const ty = v.interpolate({ inputRange: [0, 1], outputRange: [-58, 6] });
        const op = v.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] });
        return (
          <Animated.View key={i} style={[styles.artFloat, { transform: [{ translateX: x }, { translateY: ty }], opacity: op }]}>
            <Coin tint={tint} size={30} />
          </Animated.View>
        );
      })}
      <Animated.View style={{ transform: [{ scale }], marginTop: 36 }}>
        <View style={[styles.bigDisc, { backgroundColor: alpha(tint, 10), borderColor: alpha(tint, 27) }]}>
          <Feather name="pie-chart" size={48} color={tint} />
        </View>
      </Animated.View>
    </View>
  );
}

/** ② A coin travels wallet → wallet — "split". */
function SplitArt({ tint, active }: { tint: string; active: boolean }) {
  const tx = useRef(new Animated.Value(0)).current;
  const op = useRef(new Animated.Value(0)).current;
  const arrive = useRef(new Animated.Value(0)).current;
  const TRAVEL = 96;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(op, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(tx, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      Animated.timing(arrive, { toValue: 1, duration: 260, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
      Animated.timing(op, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(tx, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(arrive, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
      Animated.delay(360),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active]);
  const translateX = tx.interpolate({ inputRange: [0, 1], outputRange: [-TRAVEL / 2, TRAVEL / 2] });
  const lift = tx.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -22, 0] });
  const toScale = arrive.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  return (
    <View style={[styles.artBox, styles.rowArt]}>
      <View style={[styles.bigDisc, { backgroundColor: alpha(tint, 10), borderColor: alpha(tint, 27) }]}>
        <Feather name="credit-card" size={34} color={tint} />
      </View>
      <Animated.View style={[styles.travelCoin, { opacity: op, transform: [{ translateX }, { translateY: lift }] }]}>
        <Coin tint={colors.income} size={34} />
      </Animated.View>
      <Animated.View style={{ transform: [{ scale: toScale }] }}>
        <View style={[styles.bigDisc, { backgroundColor: alpha(colors.income, 10), borderColor: alpha(colors.income, 27) }]}>
          <Feather name="credit-card" size={34} color={colors.income} />
        </View>
      </Animated.View>
    </View>
  );
}

/** ③ A budget bar fills green → amber — "budgets". */
function BudgetArt({ tint, active }: { tint: string; active: boolean }) {
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(fill, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
      Animated.delay(600),
      Animated.timing(fill, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.delay(300),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active]);
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['4%', '88%'] });
  const barColor = fill.interpolate({ inputRange: [0, 0.7, 1], outputRange: [colors.income, colors.income, colors.healthAmber] });
  return (
    <View style={styles.artBox}>
      <View style={[styles.bigDisc, { backgroundColor: alpha(tint, 10), borderColor: alpha(tint, 27), marginBottom: space.lg }]}>
        <Feather name="target" size={44} color={tint} />
      </View>
      <View style={styles.budgetTrack}>
        <Animated.View style={[styles.budgetFill, { width, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

/** ④ A shield pulses with a glow ring — "privacy". */
function PrivacyArt({ tint, active }: { tint: string; active: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      Animated.delay(200),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active]);
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.6] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.4, 0] });
  return (
    <View style={styles.artBox}>
      <Animated.View style={[styles.glowRing, { borderColor: tint, transform: [{ scale: ringScale }], opacity: ringOpacity }]} />
      <View style={[styles.bigDisc, { backgroundColor: alpha(tint, 10), borderColor: alpha(tint, 27) }]}>
        <Feather name="shield" size={46} color={tint} />
      </View>
    </View>
  );
}

export function SlideArt({ kind, tint, active }: { kind: AnimKind; tint: string; active: boolean }) {
  if (kind === 'spend') return <SpendArt tint={tint} active={active} />;
  if (kind === 'split') return <SplitArt tint={tint} active={active} />;
  if (kind === 'budget') return <BudgetArt tint={tint} active={active} />;
  return <PrivacyArt tint={tint} active={active} />;
}

const styles = StyleSheet.create({
  artBox: { height: ART_SIZE, alignItems: 'center', justifyContent: 'center', marginBottom: space.xl },
  rowArt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xl },
  artFloat: { position: 'absolute', top: 0 },
  bigDisc: {
    width: 92, height: 92, borderRadius: 28,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  coin: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  travelCoin: { position: 'absolute', zIndex: 2 },
  budgetTrack: { width: 200, height: 12, borderRadius: 6, backgroundColor: colors.bgMuted, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  budgetFill: { height: '100%', borderRadius: 6 },
  glowRing: { position: 'absolute', width: 92, height: 92, borderRadius: 28, borderWidth: 2 },
});

/** Shared with the Onboarding permissions screen, which reuses the disc shape. */
export const bigDiscStyle = styles.bigDisc;
