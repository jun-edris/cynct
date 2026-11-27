// K design pieces: the night gradient with soft colour blobs, glass panels, the count-up number,
// the gradient button, and Senti the ₱1 coin with his poses. Animations use React Native's Animated
// on the native driver (transform and opacity only) and respect the phone's Reduce motion setting.
import React, { useEffect, useId, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, useTheme } from '../theme';
import { Icon } from './ui';
import { haptic } from './motion';

// ---------- reduce motion ----------
export function useReduceMotion(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (live) setOn(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOn);
    return () => { live = false; sub.remove(); };
  }, []);
  return on;
}

// ---------- gradient ----------
/** Night background with violet, magenta and blue light, like the K headers. Children sit on top. */
export function NightGradient({ children, style, dim = 0, radius = 0 }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; dim?: number; radius?: number }) {
  const { c } = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View style={[{ backgroundColor: c.navy, overflow: 'hidden', borderRadius: radius }, style]}
      onLayout={e => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size.w > 0 ? (
        <Svg width={size.w} height={size.h} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
          <Defs>
            <RadialGradient id={`${id}v`} cx="50%" cy="50%" r="50%"><Stop offset="0" stopColor={c.violet} stopOpacity={0.95} /><Stop offset="1" stopColor={c.violet} stopOpacity={0} /></RadialGradient>
            <RadialGradient id={`${id}m`} cx="50%" cy="50%" r="50%"><Stop offset="0" stopColor={c.magenta} stopOpacity={0.75} /><Stop offset="1" stopColor={c.magenta} stopOpacity={0} /></RadialGradient>
            <RadialGradient id={`${id}b`} cx="50%" cy="50%" r="50%"><Stop offset="0" stopColor={c.blue} stopOpacity={0.6} /><Stop offset="1" stopColor={c.blue} stopOpacity={0} /></RadialGradient>
          </Defs>
          <Ellipse cx={size.w * 0.12} cy={size.h * 0.05} rx={size.w * 0.62} ry={Math.max(170, size.h * 0.42)} fill={`url(#${id}v)`} />
          <Ellipse cx={size.w * 0.98} cy={Math.min(size.h * 0.32, 200)} rx={size.w * 0.55} ry={Math.max(150, size.h * 0.36)} fill={`url(#${id}m)`} />
          <Ellipse cx={size.w * 0.45} cy={size.h * 0.92} rx={size.w * 0.6} ry={Math.max(120, size.h * 0.3)} fill={`url(#${id}b)`} />
          {dim > 0 ? <Rect x={0} y={0} width={size.w} height={size.h} fill="#0A0618" opacity={dim} /> : null}
        </Svg>
      ) : null}
      {children}
    </View>
  );
}

/** The cream sheet that slides up over a gradient header. */
export function SheetUp({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -28 }, style]}>{children}</View>;
}

export function Glass({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: 'rgba(255,255,255,0.13)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.26)', borderRadius: 16 }, style]}>{children}</View>;
}

/** A pill on the gradient: white, or outlined glass. */
export function OnNightPill({ label, onPress, icon, outline, style }: { label: string; onPress: () => void; icon?: React.ReactNode; outline?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable onPress={() => { haptic(); onPress(); }} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [{ height: 40, borderRadius: 20, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        backgroundColor: outline ? 'rgba(255,255,255,0.14)' : '#FFFFFF', borderWidth: outline ? 1 : 0, borderColor: 'rgba(255,255,255,0.4)', transform: [{ scale: pressed ? 0.96 : 1 }] }, style]}>
      {icon}
      <Text style={{ fontFamily: fonts.semi, fontSize: 14, color: outline ? '#FFFFFF' : '#17122D' }}>{label}</Text>
    </Pressable>
  );
}

/** Violet → magenta button for the one main action on a screen. */
export function GradButton({ label, onPress, disabled, style }: { label: string; onPress?: () => void; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [w, setW] = useState(0);
  return (
    <Pressable onPress={() => { haptic(); onPress?.(); }} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
      onLayout={e => setW(e.nativeEvent.layout.width)}
      style={({ pressed }) => [{ height: 56, borderRadius: 28, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }] }, style]}>
      {w > 0 ? (
        <Svg width={w} height={56} style={{ position: 'absolute' }}>
          <Defs><LinearGradient id={id} x1="0" y1="0" x2="1" y2="0.4"><Stop offset="0" stopColor={c.gradFrom} /><Stop offset="0.45" stopColor={c.gradMid} /><Stop offset="1" stopColor={c.gradTo} /></LinearGradient></Defs>
          <Rect x={0} y={0} width={w} height={56} fill={`url(#${id})`} />
        </Svg>
      ) : null}
      <Text style={{ fontFamily: fonts.bold, fontSize: 16.5, color: '#FFFFFF' }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/** A number that counts up from 0 once, easing out. Shows the final value straight away with Reduce motion. */
export function useCountUp(target: number, ms = 1100): number {
  const reduce = useReduceMotion();
  const [n, setN] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (reduce) return;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / ms);
      setN(Math.round(target * (1 - Math.pow(1 - t, 4))));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current !== null) cancelAnimationFrame(raf.current); };
  }, [target, ms, reduce]);
  return reduce ? target : n;
}

// ---------- Senti ----------
const INK = '#17122D';
const COIN = '#FFB020';
const PINK = '#E5458F';
type Rot = Animated.AnimatedInterpolation<string | number> | string;

/** One full-size layer of Senti, rotated about `origin` (a CSS-style "x% y%" within his 160×200 box). */
function Layer({ w, rotate, origin, scaleY, children }: { w: number; rotate?: Rot; origin: string; scaleY?: Animated.AnimatedInterpolation<number> | Animated.Value; children: React.ReactNode }) {
  const h = w * 1.25;
  const transform: object[] = [];
  if (rotate) transform.push({ rotate });
  if (scaleY) transform.push({ scaleY });
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, transformOrigin: origin, transform: transform as never }}>
      <Svg width={w} height={h} viewBox="0 0 160 200">{children}</Svg>
    </Animated.View>
  );
}

const glove = (x: number, y: number) => <Circle cx={x} cy={y} r={9.5} fill="#fff" stroke={INK} strokeWidth={3} />;

export type SentiFace = 'grin' | 'smile' | 'content';
export type SentiArms = 'wave' | 'up' | 'rest';

/**
 * Senti standing. `left`/`right`/`legs` are rotations (e.g. from useSentiMotion) for the waving arm,
 * the other arm and the legs. Arms: 'wave' raises the left one, 'up' raises both, 'rest' lowers both.
 */
export function Senti({ size = 110, face = 'smile', arms = 'rest', left, right, legs, blink = true, label = 'Senti' }: {
  size?: number; face?: SentiFace; arms?: SentiArms; left?: Rot; right?: Rot; legs?: Rot; blink?: boolean; label?: string;
}) {
  const eye = useBlink(blink);
  const h = size * 1.25;
  return (
    <View style={{ width: size, height: h }} accessible accessibilityRole="image" accessibilityLabel={label}>
      <Layer w={size} rotate={legs} origin="50% 69%">
        <Path d="M70 138 q-6 24 -16 40 M90 138 q6 24 16 40" stroke={INK} strokeWidth={5} fill="none" strokeLinecap="round" />
        <Ellipse cx={50} cy={182} rx={15} ry={8} fill={INK} /><Ellipse cx={110} cy={182} rx={15} ry={8} fill={INK} />
      </Layer>
      <Layer w={size} rotate={right} origin="76% 48%">
        {arms === 'up'
          ? <G><Path d="M122 92 q22 -10 24 -42" stroke={INK} strokeWidth={5} fill="none" strokeLinecap="round" />{glove(146, 44)}</G>
          : <G><Path d="M122 100 q20 8 14 30" stroke={INK} strokeWidth={5} fill="none" strokeLinecap="round" />{glove(136, 132)}</G>}
      </Layer>
      <Layer w={size} rotate={left} origin="24% 47%">
        {arms === 'rest'
          ? <G><Path d="M38 100 q-20 8 -14 30" stroke={INK} strokeWidth={5} fill="none" strokeLinecap="round" />{glove(24, 132)}</G>
          : <G><Path d="M38 92 q-22 -10 -24 -42" stroke={INK} strokeWidth={5} fill="none" strokeLinecap="round" />{glove(14, 44)}</G>}
      </Layer>
      <Layer w={size} origin="50% 46%">
        <Circle cx={80} cy={92} r={50} fill={COIN} stroke={INK} strokeWidth={4} />
        <Circle cx={80} cy={92} r={41} fill="none" stroke={INK} strokeWidth={1.6} strokeDasharray="2 4" opacity={0.5} />
        {face === 'grin'
          ? <G><Path d="M60 104 q20 22 40 0 z" fill={INK} /><Path d="M70 112 q10 6 20 0 q-10 -4 -20 0z" fill={PINK} /></G>
          : <Path d="M68 106 q12 10 24 0" stroke={INK} strokeWidth={4} fill="none" strokeLinecap="round" />}
        <Circle cx={53} cy={102} r={5} fill={PINK} opacity={0.35} /><Circle cx={107} cy={102} r={5} fill={PINK} opacity={0.35} />
        {face === 'content' ? <Path d="M60 88 q7 -9 14 0 M86 88 q7 -9 14 0" stroke={INK} strokeWidth={4.5} fill="none" strokeLinecap="round" /> : null}
      </Layer>
      {face !== 'content' ? (
        <Layer w={size} origin="50% 43%" scaleY={eye}>
          <Ellipse cx={67} cy={86} rx={7} ry={11} fill={INK} /><Path d="M70 79 l-6 6 h7z" fill="#fff" />
          <Ellipse cx={93} cy={86} rx={7} ry={11} fill={INK} /><Path d="M96 79 l-6 6 h7z" fill="#fff" />
        </Layer>
      ) : null}
    </View>
  );
}

/** Senti tumbling backwards: arms flung up, legs kicked forward, mouth in an "o". Flails while `flail` runs. */
export function SentiFall({ size = 110, flail }: { size?: number; flail?: Animated.Value }) {
  const l = flail?.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '10deg'] });
  const r = flail?.interpolate({ inputRange: [0, 1], outputRange: ['8deg', '-10deg'] });
  return (
    <View style={{ width: size, height: size * 1.25 }} accessible accessibilityRole="image" accessibilityLabel="Senti falling backwards">
      <Layer w={size} origin="50% 69%">
        <Path d="M74 138 q18 24 50 30 M90 136 q24 12 52 8" stroke={INK} strokeWidth={5} fill="none" strokeLinecap="round" />
        <Ellipse cx={130} cy={168} rx={15} ry={8} fill={INK} transform="rotate(-25 130 168)" />
        <Ellipse cx={148} cy={142} rx={15} ry={8} fill={INK} transform="rotate(-50 148 142)" />
      </Layer>
      <Layer w={size} rotate={l} origin="23% 43%">
        <Path d="M36 86 q-26 -12 -30 -46" stroke={INK} strokeWidth={5} fill="none" strokeLinecap="round" />{glove(6, 38)}
      </Layer>
      <Layer w={size} rotate={r} origin="75% 37%">
        <Path d="M120 74 q18 -20 16 -50" stroke={INK} strokeWidth={5} fill="none" strokeLinecap="round" />{glove(136, 22)}
      </Layer>
      <Layer w={size} origin="50% 46%">
        <Circle cx={80} cy={92} r={50} fill={COIN} stroke={INK} strokeWidth={4} />
        <Circle cx={80} cy={92} r={41} fill="none" stroke={INK} strokeWidth={1.6} strokeDasharray="2 4" opacity={0.5} />
        <Path d="M58 72 q7 -6 15 -3 M87 69 q8 -3 15 3" stroke={INK} strokeWidth={3.5} fill="none" strokeLinecap="round" />
        <Circle cx={67} cy={84} r={5} fill={INK} /><Circle cx={93} cy={84} r={5} fill={INK} />
        <Ellipse cx={80} cy={108} rx={7} ry={8.5} fill={INK} /><Ellipse cx={80} cy={111} rx={4} ry={3} fill={PINK} />
        <Circle cx={53} cy={100} r={5} fill={PINK} opacity={0.35} /><Circle cx={107} cy={100} r={5} fill={PINK} opacity={0.35} />
      </Layer>
    </View>
  );
}

/** Senti's face alone, for cards and notifications. */
export function SentiBadge({ size = 40, face = 'smile' }: { size?: number; face?: 'smile' | 'flat' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Senti">
      <Circle cx={32} cy={32} r={27} fill={COIN} stroke={INK} strokeWidth={3} />
      <Ellipse cx={25} cy={29} rx={3} ry={4} fill={INK} /><Ellipse cx={39} cy={29} rx={3} ry={4} fill={INK} />
      {face === 'smile' ? <Path d="M24 38 q8 7 16 0" stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" /> : <Path d="M25 42 h14" stroke={INK} strokeWidth={3} strokeLinecap="round" />}
    </Svg>
  );
}

function useBlink(on: boolean) {
  const [v] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!on) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(3600),
      Animated.timing(v, { toValue: 0.1, duration: 80, useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [on, v]);
  return v;
}

/** A looping 0↔1 value for waves and flails. */
export function useLoop(period: number, run: boolean, delay = 0, easing: (t: number) => number = Easing.inOut(Easing.sin)) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!run) { v.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: period / 2, easing, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: period / 2, easing, useNativeDriver: true }),
    ]));
    const t = setTimeout(() => loop.start(), delay);
    return () => { clearTimeout(t); loop.stop(); };
  }, [run, period, delay, easing, v]);
  return v;
}

// ---------- screen header ----------
/** Round glass icon button for use on the night gradient. */
export function GlassIcon({ name, label, onPress }: { name: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={() => { haptic(); onPress(); }} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.13)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.26)', transform: [{ scale: pressed ? 0.92 : 1 }] })}>
      <Icon name={name} size={20} color="#FFFFFF" />
    </Pressable>
  );
}

/**
 * The K screen top: a night gradient running under the status bar with a title, glass buttons on the right
 * and the screen's big number below. Use inside <Screen headerless edge>, followed by <KSheet>.
 */
export function KHeader({ title, right, back, children }: { title: string; right?: React.ReactNode; back?: boolean; children?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <NightGradient style={{ marginHorizontal: -18, paddingTop: insets.top + 12, paddingHorizontal: 18, paddingBottom: 46 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 }}>
        {back ? <GlassIcon name="arrow-left" label="Back" onPress={() => router.back()} /> : null}
        <Text style={{ flex: 1, fontFamily: fonts.numBlack, fontSize: 28, letterSpacing: -0.85, color: '#FFFFFF' }} accessibilityRole="header" numberOfLines={1}>{title}</Text>
        {right}
      </View>
      {children}
    </NightGradient>
  );
}

/** The cream sheet under a KHeader, full-bleed to the screen edges. */
export function KSheet({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -28, marginHorizontal: -18, paddingHorizontal: 18, paddingTop: 16 }}>{children}</View>;
}

/** White label text for the gradient. */
export function OnNight({ children, v = 'sm', style }: { children: React.ReactNode; v?: 'sm' | 'xs'; style?: StyleProp<import('react-native').TextStyle> }) {
  return <Text style={[{ fontFamily: fonts.medium, fontSize: v === 'sm' ? 14 : 12, color: '#E7E0FF' }, style]}>{children}</Text>;
}

// ---------- coin jar ----------
/** A plain ₱ coin seen face-on: Senti without his face, for filling jars. */
function CoinShape({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} fill={COIN} stroke={INK} strokeWidth={r * 0.16} />
      <Circle cx={cx} cy={cy} r={r * 0.7} fill="none" stroke={INK} strokeWidth={r * 0.07} strokeDasharray={`${r * 0.12} ${r * 0.22}`} opacity={0.5} />
      <Ellipse cx={cx - r * 0.35} cy={cy - r * 0.4} rx={r * 0.22} ry={r * 0.12} fill="#FFFFFF" opacity={0.55} transform={`rotate(-35 ${cx - r * 0.35} ${cy - r * 0.4})`} />
    </G>
  );
}

// Small, stable wobble per coin so the pile looks tossed in, not gridded.
const jit = (i: number) => (((i * 9301 + 49297) % 233280) / 233280 - 0.5);

/**
 * A glass jar that fills with faceless ₱ coins as a goal fills up. The last few coins drop in when it
 * appears (skipped with Reduce motion). `onDark` draws the glass for a gradient or night background.
 */
export function CoinJar({ pct, width = 150, label, onDark = true }: { pct: number; width?: number; label?: string; onDark?: boolean }) {
  const reduce = useReduceMotion();
  const W = width, H = width * 1.22;
  const glass = onDark ? '#FFFFFF' : INK;
  // Jar geometry (in px): a lid, a short neck and a rounded body.
  const lidW = W * 0.62, lidH = H * 0.07, neckW = W * 0.56, neckY = lidH, bodyY = H * 0.2;
  const left = W * 0.06, right = W * 0.94, bottom = H * 0.97, rad = W * 0.16;
  const body = `M${(W - neckW) / 2} ${neckY} L${(W - neckW) / 2} ${bodyY - rad * 0.3} Q${(W - neckW) / 2} ${bodyY} ${left + rad} ${bodyY}`
    + ` Q${left} ${bodyY} ${left} ${bodyY + rad} L${left} ${bottom - rad} Q${left} ${bottom} ${left + rad} ${bottom} L${right - rad} ${bottom}`
    + ` Q${right} ${bottom} ${right} ${bottom - rad} L${right} ${bodyY + rad} Q${right} ${bodyY} ${right - rad} ${bodyY}`
    + ` Q${(W + neckW) / 2} ${bodyY} ${(W + neckW) / 2} ${bodyY - rad * 0.3} L${(W + neckW) / 2} ${neckY} Z`;

  // Pack coins in offset rows inside the body.
  const r = Math.max(7, W * 0.075);
  const innerL = left + r * 0.9, innerR = right - r * 0.9, floor = bottom - r * 1.05, ceil = bodyY + r * 0.6;
  const cols = Math.max(1, Math.floor((innerR - innerL) / (r * 2)) + 1);
  const rowH = r * 1.7;
  const rows = Math.max(1, Math.floor((floor - ceil) / rowH) + 1);
  const spots: { x: number; y: number }[] = [];
  for (let row = 0; row < rows; row++) {
    const shift = row % 2 ? r : 0;
    const n = row % 2 ? cols - 1 : cols;
    for (let k = 0; k < n; k++) {
      const i = spots.length;
      spots.push({ x: innerL + shift + k * ((innerR - innerL) / Math.max(1, cols - 1)) + jit(i) * r * 0.35, y: floor - row * rowH + jit(i + 7) * r * 0.25 });
    }
  }
  const p = Math.max(0, Math.min(1, pct));
  const count = p <= 0 ? 0 : Math.max(1, Math.round(p * spots.length));
  const animN = reduce ? 0 : Math.min(6, count);
  const still = spots.slice(0, count - animN);
  const falling = spots.slice(count - animN, count);

  return (
    <View style={{ width: W, height: H }} accessible accessibilityRole="image" accessibilityLabel={`Coin jar ${Math.round(p * 100)}% full${label ? `, goal ${label}` : ''}`}>
      <Svg width={W} height={H} style={{ position: 'absolute' }}>
        <Path d={body} fill={glass} opacity={0.08} />
        {still.map((s, i) => <CoinShape key={i} cx={s.x} cy={s.y} r={r} />)}
      </Svg>
      {falling.map((s, i) => <FallingCoin key={i} x={s.x} y={s.y} r={r} delay={250 + i * 140} from={-s.y - r * 2} />)}
      <Svg width={W} height={H} style={{ position: 'absolute' }} pointerEvents="none">
        <Path d={body} fill="none" stroke={glass} strokeWidth={2.5} opacity={0.75} />
        <Path d={`M${left + W * 0.07} ${bodyY + rad} L${left + W * 0.07} ${bottom - rad * 1.4}`} stroke={glass} strokeWidth={3} strokeLinecap="round" opacity={0.35} />
        <Rect x={(W - lidW) / 2} y={0} width={lidW} height={lidH} rx={lidH / 2.4} fill={onDark ? 'rgba(255,255,255,0.28)' : 'rgba(23,18,45,0.18)'} stroke={glass} strokeWidth={2} strokeOpacity={0.75} />
      </Svg>
      {label ? (
        <View style={{ position: 'absolute', right: -4, top: H * 0.24, backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1.5, borderColor: INK, transform: [{ rotate: '6deg' }] }}>
          <Text style={{ fontFamily: fonts.num, fontSize: 12, color: INK }}>{label}</Text>
        </View>
      ) : null}
    </View>
  );
}

function FallingCoin({ x, y, r, delay, from }: { x: number; y: number; r: number; delay: number; from: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.sequence([Animated.delay(delay), Animated.timing(v, { toValue: 1, duration: 520, easing: Easing.bounce, useNativeDriver: true })]);
    a.start();
    return () => a.stop();
  }, [v, delay]);
  const size = r * 2 + 4;
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size,
      opacity: v.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 1, 1] }),
      transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }, { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] }) }] }}>
      <Svg width={size} height={size}><CoinShape cx={size / 2} cy={size / 2} r={r} /></Svg>
    </Animated.View>
  );
}
