import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { G, Path, Circle } from 'react-native-svg';
import { colors } from '../../constants/colors';

const AG = Animated.createAnimatedComponent(G);
const ACircle = Animated.createAnimatedComponent(Circle);

const C = 100, RO = 82, RI = 52, GAP = 4, LARGE = 150;

// The four logo wedges (teal/amber/green/purple/red palette → matches the app icon).
const WEDGES = [
  { frac: 0.30, color: '#F5B301' },
  { frac: 0.26, color: '#2BD49B' },
  { frac: 0.22, color: '#8B7CF8' },
  { frac: 0.22, color: '#FF5C5C' },
];

function pt(r: number, deg: number): [number, number] {
  const a = (deg - 90) * Math.PI / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function wedgePath(a0: number, a1: number): string {
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x0, y0] = pt(RO, a0), [x1, y1] = pt(RO, a1);
  const [x2, y2] = pt(RI, a1), [x3, y3] = pt(RI, a0);
  return `M${x0} ${y0} A${RO} ${RO} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${RI} ${RI} 0 ${large} 0 ${x3} ${y3} Z`;
}

const SEGMENTS = (() => {
  let acc = 0;
  return WEDGES.map(w => {
    const a0 = acc * 360 + GAP / 2;
    const a1 = (acc + w.frac) * 360 - GAP / 2;
    acc += w.frac;
    const mid = (a0 + a1) / 2;
    const midRad = (mid - 90) * Math.PI / 180;
    return { d: wedgePath(a0, a1), color: w.color, dirX: Math.cos(midRad), dirY: Math.sin(midRad) };
  });
})();

/**
 * The brand mark, animated on mount: a solid teal ring snaps into colored
 * wedges, the wedges scatter off, fly back together like a magnet, then the
 * whole donut spins fast and settles. Holds the assembled logo when done.
 * (react-native-svg animated props use the JS driver — useNativeDriver: false.)
 */
export function LogoAssembly({ size = 180 }: { size?: number }) {
  const breakV = useRef(new Animated.Value(0)).current;   // ring → wedges
  const offsetV = useRef(new Animated.Value(0)).current;  // 0 → out → back
  const spinV = useRef(new Animated.Value(0)).current;    // final spin

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(180),
      // Ring snaps into wedges, then they're thrown out of frame.
      Animated.timing(breakV, { toValue: 1, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(offsetV, { toValue: 1, duration: 320, easing: Easing.in(Easing.cubic), useNativeDriver: false }),
      // Pulled back together AND spinning at the same time — the spin starts
      // while they're still aligning, so the convergence carries into the spin.
      Animated.parallel([
        Animated.timing(offsetV, { toValue: 0, duration: 760, easing: Easing.out(Easing.back(2)), useNativeDriver: false }),
        Animated.sequence([
          Animated.delay(120),
          // Accelerate as the wedges align (slow build), then ease to a stop.
          Animated.timing(spinV, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
        ]),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [breakV, offsetV, spinV]);

  const ringOpacity = breakV.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const scatterOpacity = offsetV.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0.25, 0] });
  const wedgeOpacity = Animated.multiply(breakV, scatterOpacity);
  const rotation = spinV.interpolate({ inputRange: [0, 1], outputRange: [0, 720] });

  return (
    <Svg width={size} height={size} viewBox="-20 -20 240 240">
      {/* Initial solid ring (single colour) that breaks into wedges */}
      <ACircle
        cx={C} cy={C} r={(RO + RI) / 2}
        stroke={colors.accent} strokeWidth={RO - RI} fill="none"
        opacity={ringOpacity}
      />
      {/* Spinning group of wedges */}
      <AG rotation={rotation} originX={C} originY={C}>
        {SEGMENTS.map((s, i) => (
          <AG
            key={i}
            x={Animated.multiply(offsetV, s.dirX * LARGE)}
            y={Animated.multiply(offsetV, s.dirY * LARGE)}
            opacity={wedgeOpacity}
          >
            <Path d={s.d} fill={s.color} />
          </AG>
        ))}
      </AG>
    </Svg>
  );
}
