import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { G, Path, Circle } from 'react-native-svg';
import { colors } from '../../constants/colors';

const AG = Animated.createAnimatedComponent(G);
const ACircle = Animated.createAnimatedComponent(Circle);

const GAP = 4;
const DONUT = 188;
const RO = DONUT * 0.46;
const RI = DONUT * 0.30;

// 0° = 12 o'clock, 90° = 3 o'clock, 180° = 6 o'clock, 270° = 9 o'clock.
// FINAL ring — yellow dominant from 12 → ~5 o'clock; the rest fill round it.
// Index 0 = the tiny teal keeper. Indices 1..4 = colored (yellow first).
const FINAL_ANG = [
  { a0: 232, a1: 250, color: colors.accent },       // keeper — ≈8 o'clock
  { a0: 0,   a1: 150, color: colors.healthAmber },  // yellow — 12 → 5 o'clock (dominant)
  { a0: 150, a1: 232, color: colors.income },       // green
  { a0: 250, a1: 305, color: colors.settle },       // purple
  { a0: 305, a1: 360, color: colors.healthRed },    // red
];

// INITIAL ring — 4 teal slices of DIFFERENT, uneven proportions that fly off.
// They tile the whole circle EXCEPT the keeper's 8-o'clock slot (232°–250°), so
// initial ring = keeper + these 4 with no gaps/overlap. Angles may exceed 360°
// (they wrap); deliberately unlike the final layout (reads as new pieces).
const INIT_ANG = [
  { a0: 250, a1: 332 }, // 82°
  { a0: 332, a1: 430 }, // 98° (wraps through 12 o'clock)
  { a0: 430, a1: 520 }, // 90°
  { a0: 520, a1: 592 }, // 72° (ends at keeper's edge, 232°)
];

// --- Physics (px, seconds, mass = 1) -------------------------------------
const R_EQ = 60;                       // hover distance just outside each slot
const K = 90;                          // transport spring (fly-in to hover)
const C = 2 * 0.85 * Math.sqrt(K);     // ζ≈0.85 → glide in, no centre-crossing
const K_S = 360;                       // snap spring — extremely fast
const C_S = 2 * Math.sqrt(K_S);        // critical damping → precise, no overshoot
const JIT_PX = 2.4;                    // vibration amplitude — very small
const JIT_HZ = 16;                     // vibration frequency — very fast
const PHASE = [0, 1.1, 2.2, 3.3, 4.4];
const START = [0, 0, 0.14, 0.28, 0.42]; // keeper + yellow first, then staggered

const TENSION_S = 1.0; // brief tension
const SNAP_S = 0.4;    // extremely fast snap
const ROT_DEG = 2160;  // 6 turns — ~2× faster, strong momentum

// Geometry built around the ORIGIN (0,0); the ring is translated into place so
// rotation about (0,0) spins it on its own centre.
function pt(r: number, deg: number): [number, number] {
  const a = (deg - 90) * Math.PI / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
}
function wedgePath(a0: number, a1: number): string {
  const b0 = a0 + GAP / 2, b1 = a1 - GAP / 2;
  const large = b1 - b0 > 180 ? 1 : 0;
  const [x0, y0] = pt(RO, b0), [x1, y1] = pt(RO, b1);
  const [x2, y2] = pt(RI, b1), [x3, y3] = pt(RI, b0);
  return `M${x0} ${y0} A${RO} ${RO} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${RI} ${RI} 0 ${large} 0 ${x3} ${y3} Z`;
}
function dirOf(a0: number, a1: number) {
  const mid = (a0 + a1) / 2;
  const r = (mid - 90) * Math.PI / 180;
  return { x: Math.cos(r), y: Math.sin(r) };
}

const FINAL = FINAL_ANG.map(s => ({ d: wedgePath(s.a0, s.a1), color: s.color, dir: dirOf(s.a0, s.a1) }));
const INIT = INIT_ANG.map(s => ({ d: wedgePath(s.a0, s.a1), dir: dirOf(s.a0, s.a1) }));

/**
 * Brand-mark assembly (physics-driven, ~3.7s): an uneven teal ring slices apart
 * → 4 slices fly off-screen, the tiny keeper slides to the top-right →
 * differently-sized colored wedges fly in from different directions (yellow
 * first) → brief fast micro-vibration → an extremely fast critically-damped
 * snap pulls everything together while it begins to spin → the locked ring
 * immediately spins very fast and decelerates to a smooth stop. Each wedge runs
 * a real 2-D mass-spring-damper integrator.
 */
export function LogoAssembly({ width, height, cy: cyProp }: { width: number; height: number; cy?: number }) {
  const cx = width / 2;
  const cy = cyProp ?? height / 2;
  const LARGE = Math.max(width, height) * 0.7;

  const flyV = useRef(INIT.map(() => new Animated.Value(0))).current;  // 4 teal slices leaving
  const tx = useRef(FINAL.map(() => new Animated.Value(0))).current;   // 5 elements x offset
  const ty = useRef(FINAL.map(() => new Animated.Value(0))).current;   // 5 elements y offset
  const fanV = useRef(new Animated.Value(0)).current;
  const breakV = useRef(new Animated.Value(0)).current; // 0 = solid budget ring, 1 = broken into sections

  useEffect(() => {
    const fly = Animated.sequence([
      Animated.delay(700), // let the complete budget ring read first
      // Solid budget ring breaks into its sections (gaps appear).
      Animated.timing(breakV, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.stagger(170, flyV.map(v =>
        Animated.timing(v, { toValue: 1, duration: 820, easing: Easing.in(Easing.cubic), useNativeDriver: false }),
      )),
    ]);
    fly.start();

    const TR = { x: width * 0.27, y: -height * 0.20 }; // top-right area
    const trLen = Math.hypot(TR.x, TR.y) || 1;
    const outUnit = FINAL.map((s, i) => i === 0 ? { x: TR.x / trLen, y: TR.y / trLen } : s.dir);
    const hover = FINAL.map((s, i) => i === 0 ? TR : { x: s.dir.x * R_EQ, y: s.dir.y * R_EQ });
    // Each colored wedge enters from the direction of its OWN final position.
    const spawn = FINAL.map((s, i) => i === 0 ? { x: 0, y: 0 } : { x: s.dir.x * LARGE, y: s.dir.y * LARGE });

    const pos = spawn.map(p => ({ ...p }));
    const vel = FINAL.map(() => ({ x: 0, y: 0 }));
    FINAL.forEach((_, i) => { tx[i].setValue(pos[i].x); ty[i].setValue(pos[i].y); });

    const startDelay = 1850; // shifted with the longer solid-ring hold
    let raf = 0, t0 = 0, last = 0, started = false, fanStarted = false;

    const step = (now: number) => {
      if (!t0) { t0 = now; last = now; }
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.034) dt = 0.034;
      const t = (now - t0) / 1000;
      const snapping = t > TENSION_S;

      if (snapping && !fanStarted) {
        fanStarted = true;
        // Wind up fast, then carry momentum and decelerate to a smooth stop.
        Animated.sequence([
          Animated.timing(fanV, { toValue: 0.10, duration: 150, easing: Easing.in(Easing.quad), useNativeDriver: false }),
          Animated.timing(fanV, { toValue: 1, duration: 1250, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        ]).start();
      }

      for (let i = 0; i < FINAL.length; i++) {
        if (t < START[i]) { tx[i].setValue(pos[i].x); ty[i].setValue(pos[i].y); continue; }
        const tgt = snapping ? { x: 0, y: 0 } : hover[i];
        const k = snapping ? K_S : K;
        const c = snapping ? C_S : C;
        vel[i].x += (-k * (pos[i].x - tgt.x) - c * vel[i].x) * dt;
        vel[i].y += (-k * (pos[i].y - tgt.y) - c * vel[i].y) * dt;
        pos[i].x += vel[i].x * dt;
        pos[i].y += vel[i].y * dt;
        const vib = snapping ? 0 : JIT_PX * Math.sin(2 * Math.PI * JIT_HZ * t + PHASE[i]);
        tx[i].setValue(pos[i].x + outUnit[i].x * vib);
        ty[i].setValue(pos[i].y + outUnit[i].y * vib);
      }

      if (t < TENSION_S + SNAP_S) {
        raf = requestAnimationFrame(step);
      } else {
        FINAL.forEach((_, i) => { tx[i].setValue(0); ty[i].setValue(0); });
      }
    };

    const startTimer = setTimeout(() => { started = true; raf = requestAnimationFrame(step); }, startDelay);

    return () => {
      fly.stop();
      clearTimeout(startTimer);
      if (started && raf) cancelAnimationFrame(raf);
    };
  }, [flyV, tx, ty, fanV, breakV, width, height, LARGE]);

  const fanRotation = fanV.interpolate({ inputRange: [0, 1], outputRange: [0, ROT_DEG] });
  const solidOpacity = breakV.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Svg width={width} height={height} pointerEvents="none">
      <G transform={`translate(${cx} ${cy})`}>
        {/* Complete solid budget ring — breaks into the sections below */}
        <ACircle cx={0} cy={0} r={(RO + RI) / 2} stroke={colors.accent} strokeWidth={RO - RI} fill="none" opacity={solidOpacity} />

        {/* The 4 uneven teal slices flying off-screen */}
        {INIT.map((s, i) => (
          <AG
            key={`fly-${i}`}
            x={Animated.multiply(flyV[i], s.dir.x * LARGE)}
            y={Animated.multiply(flyV[i], s.dir.y * LARGE)}
            opacity={breakV}
          >
            <Path d={s.d} fill={colors.accent} />
          </AG>
        ))}

        {/* Keeper + colored wedges (2-D physics) — fan-rotates on its own centre */}
        <AG rotation={fanRotation}>
          {FINAL.map((s, i) => (
            <AG key={`r-${i}`} x={tx[i]} y={ty[i]} opacity={breakV}>
              <Path d={s.d} fill={s.color} />
            </AG>
          ))}
        </AG>
      </G>
    </Svg>
  );
}
