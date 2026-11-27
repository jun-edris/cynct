// After an entry is saved: Senti reacts, then (for spends over the threshold, and for money in) "Worth it?".
// Money in or a saving: he tumbles in backwards from the top, lands on his back, bounces up and waves hi.
// A spend: he pops up on the sheet's edge, waves bye with both arms and drifts away, turning slowly.
import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Pressable, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useData } from '../data/DataContext';
import { fonts, useTheme } from '../theme';
import { Button, Chip, Icon, T, close } from '../components/ui';
import { NightGradient, Senti, SentiBadge, SentiFall, useLoop, useReduceMotion } from '../components/k';
import { haptic } from '../components/motion';
import { setWorth } from '../db/repo';

type Kind = 'in' | 'save' | 'out';
const FEELS = [['treat', 'Treat'], ['needed', 'Needed'], ['rushed', 'Rushed'], ['planned', 'Planned']] as const;
const t = (v: Animated.Value, toValue: number, duration: number, easing?: (x: number) => number) =>
  Animated.timing(v, { toValue, duration, easing, useNativeDriver: true });

export default function Saved() {
  const p = useLocalSearchParams<{ kind?: string; amount?: string; title?: string; sub?: string; tx?: string; ask?: string }>();
  const kind: Kind = p.kind === 'in' || p.kind === 'save' ? p.kind : 'out';
  const { c } = useTheme();
  const { act } = useData();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduce = useReduceMotion();
  const ask = p.ask === '1';

  const [sheetY, setSheetY] = useState(0);
  const [worth, setW] = useState<0 | 1 | null>(null);
  const [feel, setFeel] = useState<string | null>(null);

  const finish = (save: boolean) => {
    if (save && p.tx && (worth !== null || feel)) act(db => setWorth(db, p.tx!, worth, feel));
    close();
  };

  // Header check pops in.
  const [pop] = useState(() => new Animated.Value(reduce ? 1 : 0));
  useEffect(() => { if (!reduce) Animated.spring(pop, { toValue: 1, stiffness: 420, damping: 18, mass: 1, useNativeDriver: true }).start(); }, [pop, reduce]);

  return (
    <View style={{ flex: 1, backgroundColor: c.navy }}>
      <NightGradient dim={0.4} style={{ position: 'absolute', left: 0, top: 0, width, height }} />
      <View style={{ position: 'absolute', left: 22, top: insets.top + 36, right: kind === 'out' ? 22 : width * 0.45, zIndex: 1 }}>
        <Animated.View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
          <Icon name="check" size={26} color="#0F7A4A" />
        </Animated.View>
        {p.title ? <T v="medium" color="#E7E0FF" style={{ marginTop: 12 }} numberOfLines={1}>{p.title}</T> : null}
        <T v="display" color="#FFFFFF" style={{ fontSize: 34, lineHeight: 40, marginTop: 2 }} numberOfLines={1}>{p.amount ?? ''}</T>
        {p.sub ? <T v="medium" color="#E7E0FF" numberOfLines={1}>{p.sub}</T> : null}
      </View>

      {sheetY > 0 ? (kind === 'out'
        ? <FloatAway sheetY={sheetY} width={width} reduce={reduce} />
        : <DropIn sheetY={sheetY} width={width} reduce={reduce} />) : null}

      <View style={{ flex: 1 }} />
      <View onLayout={e => setSheetY(e.nativeEvent.layout.y)}
        style={{ backgroundColor: c.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 16, zIndex: 3 }}>
        <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.line, marginBottom: 14 }} />
        {ask ? (
          <>
            <T v="title">Worth it?</T>
            <T v="muted" style={{ marginTop: 4 }}>No wrong answer. You’ll see the pattern at month end.</T>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <WorthButton label="Worth it" on={worth === 1} onPress={() => setW(worth === 1 ? null : 1)} face="smile" />
              <WorthButton label="Not really" on={worth === 0} onPress={() => setW(worth === 0 ? null : 0)} face="flat" />
            </View>
            <T v="semi" style={{ marginTop: 18 }}>How did it feel?</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {FEELS.map(([k, l]) => <Chip key={k} label={l} selected={feel === k} onPress={() => setFeel(feel === k ? null : k)} />)}
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <Button variant="secondary" label="Skip" onPress={() => finish(false)} style={{ flex: 1 }} />
              <Button label="Done" onPress={() => finish(true)} style={{ flex: 2 }} />
            </View>
          </>
        ) : (
          <>
            <T v="title">{kind === 'out' ? 'Logged' : 'Nice one'}</T>
            <T v="muted" style={{ marginTop: 4 }}>{kind === 'out' ? 'Small spends don’t get the question. Change the amount in Settings.' : 'Saved to your history.'}</T>
            <Button label="Done" onPress={() => finish(false)} style={{ marginTop: 18 }} />
          </>
        )}
      </View>
    </View>
  );
}

function WorthButton({ label, on, onPress, face }: { label: string; on: boolean; onPress: () => void; face: 'smile' | 'flat' }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => { haptic('select'); onPress(); }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={label}
      style={({ pressed }) => ({ flex: 1, height: 108, borderRadius: 24, alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: on ? c.tAmber : c.surface, borderWidth: on ? 2 : 1.5, borderColor: on ? c.ink : c.line, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <SentiBadge size={40} face={face} />
      <T v="semi" style={{ fontFamily: fonts.semi, fontSize: 16 }}>{label}</T>
    </Pressable>
  );
}

const deg = (v: Animated.Value) => v.interpolate({ inputRange: [-720, 720], outputRange: ['-720deg', '720deg'] });

/** Tumbles in backwards, lands on his back, bounces up, flips upright, lands on his feet and waves hi. */
function DropIn({ sheetY, width, reduce }: { sheetY: number; width: number; reduce: boolean }) {
  const w = Math.min(275, width * 0.7);
  const h = w * 1.25;
  const k = w / 275;
  const top = sheetY - h * 0.95;
  const left = width - w + 3;
  const [pose, setPose] = useState<'fall' | 'stand'>(reduce ? 'stand' : 'fall');
  const [waving, setWaving] = useState(reduce);
  const v = useMemo(() => ({
    ty: new Animated.Value(reduce ? 0 : -(top + h + 60)), rot: new Animated.Value(reduce ? 0 : -10),
    sx: new Animated.Value(1), sy: new Animated.Value(1), burst: new Animated.Value(0),
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const flail = useLoop(360, pose === 'fall' && !reduce, 0, Easing.linear);
  const wave = useLoop(1000, waving);

  useEffect(() => {
    if (reduce) return;
    const fall = Animated.sequence([
      Animated.delay(300),
      Animated.parallel([t(v.ty, 79 * k, 864, Easing.in(Easing.cubic)), t(v.rot, -78, 864, Easing.in(Easing.quad))]),
      Animated.parallel([t(v.rot, -74, 96), Animated.sequence([t(v.burst, 1, 120), t(v.burst, 0, 380)])]),
      Animated.parallel([t(v.ty, -90 * k, 360, Easing.out(Easing.cubic)), t(v.rot, -22, 360, Easing.out(Easing.quad))]),
    ]);
    const land = setTimeout(() => haptic('tap'), 300 + 864);
    fall.start(({ finished }) => {
      if (!finished) return;
      setPose('stand');
      Animated.sequence([
        Animated.parallel([t(v.ty, 0, 288, Easing.in(Easing.quad)), t(v.rot, 0, 288), t(v.sx, 1.1, 288), t(v.sy, 0.9, 288)]),
        Animated.parallel([t(v.ty, -12 * k, 240, Easing.out(Easing.quad)), t(v.sx, 0.96, 240), t(v.sy, 1.04, 240)]),
        Animated.parallel([t(v.ty, 0, 240), t(v.sx, 1, 240), t(v.sy, 1, 240)]),
      ]).start(() => { haptic('success'); setWaving(true); });
    });
    return () => { clearTimeout(land); fall.stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left, top, width: w, height: h, zIndex: 2, transformOrigin: '50% 46%',
        transform: [{ translateY: v.ty }, { rotate: deg(v.rot) }, { scaleX: v.sx }, { scaleY: v.sy }] }}>
        {pose === 'fall'
          ? <SentiFall size={w} flail={flail} />
          : <Senti size={w} face="grin" arms="wave" label="Senti waving hello"
              left={wave.interpolate({ inputRange: [0, 1], outputRange: ['10deg', '-28deg'] })} />}
      </Animated.View>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: left + w * 0.24, top: sheetY - 36, zIndex: 4, opacity: v.burst,
        transform: [{ scale: v.burst.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.2] }) }] }}>
        <Svg width={70} height={40} viewBox="0 0 70 40"><Path d="M8 30 l-6 -6 M18 22 l-4 -12 M30 20 l2 -14 M52 30 l8 -8" stroke="#fff" strokeWidth={3} fill="none" strokeLinecap="round" /></Svg>
      </Animated.View>
    </>
  );
}

/** Pops up on the sheet's edge, waves bye with both arms, then drifts up and away, turning slowly. */
function FloatAway({ sheetY, width, reduce }: { sheetY: number; width: number; reduce: boolean }) {
  const w = Math.min(130, width * 0.33);
  const h = w * 1.25;
  const top = sheetY - h * 0.95;
  const left = width - w - 24;
  const [floating, setFloating] = useState(false);
  const v = useMemo(() => ({
    ty: new Animated.Value(reduce ? 0 : h), tx: new Animated.Value(0), rot: new Animated.Value(0), op: new Animated.Value(1),
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const wave = useLoop(800, true, reduce ? 0 : 700);
  const dangle = useLoop(2400, floating);

  useEffect(() => {
    if (reduce) return;
    const seq = Animated.sequence([
      Animated.delay(300),
      Animated.spring(v.ty, { toValue: 0, stiffness: 260, damping: 16, mass: 1, useNativeDriver: true }),
      Animated.delay(1300),
    ]);
    seq.start(({ finished }) => {
      if (!finished) return;
      setFloating(true);
      Animated.parallel([
        t(v.ty, -(top + h + 80), 3600, Easing.inOut(Easing.sin)),
        t(v.tx, -40, 3600, Easing.inOut(Easing.sin)),
        t(v.rot, -240, 3600, Easing.inOut(Easing.sin)),
        Animated.sequence([Animated.delay(2900), t(v.op, 0, 700)]),
      ]).start();
    });
    return () => seq.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left, top, width: w, height: h, zIndex: 2, opacity: v.op, transformOrigin: '50% 46%',
      transform: [{ translateX: v.tx }, { translateY: v.ty }, { rotate: deg(v.rot) }] }}>
      <Senti size={w} face="content" arms="up" label="Senti waving goodbye"
        left={wave.interpolate({ inputRange: [0, 1], outputRange: ['4deg', '-22deg'] })}
        right={wave.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '22deg'] })}
        legs={floating ? dangle.interpolate({ inputRange: [0, 1], outputRange: ['-7deg', '7deg'] }) : undefined} />
    </Animated.View>
  );
}
