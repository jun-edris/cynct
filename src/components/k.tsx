// K design pieces: the night gradient with soft colour blobs, glass panels, the count-up number,
// the gradient button, and Senti the ₱1 coin with his poses. Animations use React Native's Animated
// on the native driver (transform and opacity only) and respect the phone's Reduce motion setting.
import React, { useEffect, useId, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { fonts, useTheme } from '../theme';
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
