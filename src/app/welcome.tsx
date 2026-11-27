import React, { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useData } from '../data/DataContext';
import { Icon, T } from '../components/ui';
import { NightGradient, OnNightPill, Senti, useLoop, useReduceMotion } from '../components/k';
import { Logo } from '../components/Logo';
import { applySeed } from '../db/repo';
import { emptySetup, mySetup } from '../lib/seed';
import { pickBackupFile, restoreFromData } from '../lib/backup';

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { act, db, toast, reload } = useData();

  const choice = (title: string, body: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => ({ padding: 14, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.13)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.26)', transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="semi" color="#FFFFFF">{title}</T>
        <T v="small" color="#E7E0FF">{body}</T>
      </View>
      <Icon name="chevron-right" color="#E7E0FF" />
    </Pressable>
  );

  const restore = async () => {
    try {
      const data = await pickBackupFile();
      if (!data) return;
      const msg = restoreFromData(db, data);
      reload();
      toast(msg);
      router.replace('/');
    } catch (e) { toast(e instanceof Error ? e.message : 'Couldn’t restore that file.'); }
  };

  return (
    <NightGradient style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingHorizontal: 20, flexGrow: 1 }}>
        <WalkIn width={width - 40} />
        <View style={{ gap: 12, marginTop: 18 }}>
          <T v="display" color="#FFFFFF" style={{ fontSize: 44, lineHeight: 46, letterSpacing: -1.6 }}>{'Every centavo,\nin sync.'}</T>
          <T v="medium" color="#E7E0FF" style={{ fontSize: 15, lineHeight: 22 }}>Spending, accounts, bills and every goal, from a new phone to a house. Stays on this phone and works offline.</T>
          {choice('Load my starting setup', 'Wise, GoTyme, Maya, GCash, house and emergency funds',
            () => { if (act(d => applySeed(d, mySetup()), 'Setup loaded. Set each account’s real balance.')) router.replace('/'); })}
          {choice('Restore a backup', 'A Cynct or Bahay .json file', restore)}
          <OnNightPill label="Start empty" style={{ height: 52, borderRadius: 26, marginTop: 4 }}
            onPress={() => { if (act(d => applySeed(d, emptySetup()))) router.replace('/wallet'); }} />
        </View>
      </ScrollView>
    </NightGradient>
  );
}

/**
 * The logo, then Senti walks in from the right, stops beside it, folds his arms and leans on it.
 * With Reduce motion he's simply there, leaning.
 */
function WalkIn({ width }: { width: number }) {
  const reduce = useReduceMotion();
  const logo = 132, senti = 118;
  const stageH = Math.max(logo, senti * 1.25) + 4;
  const logoLeft = Math.max(0, width / 2 - logo + 4);
  const restLeft = logoLeft + logo - senti * 0.2; // overlaps the tile's edge so he leans on it
  const [phase, setPhase] = useState<'walk' | 'lean'>(reduce ? 'lean' : 'walk');
  const [v] = useState(() => ({ x: new Animated.Value(reduce ? 0 : width - restLeft + 20), lean: new Animated.Value(reduce ? 1 : 0), pop: new Animated.Value(reduce ? 1 : 0) }));
  const step = useLoop(420, phase === 'walk' && !reduce, 0, Easing.linear);

  useEffect(() => {
    if (reduce) return;
    const run = Animated.sequence([
      Animated.spring(v.pop, { toValue: 1, stiffness: 300, damping: 16, mass: 1, useNativeDriver: true }),
      Animated.delay(150),
      Animated.timing(v.x, { toValue: 0, duration: 1900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]);
    run.start(({ finished }) => {
      if (!finished) return;
      setPhase('lean');
      Animated.spring(v.lean, { toValue: 1, stiffness: 160, damping: 12, mass: 1, useNativeDriver: true }).start();
    });
    return () => run.stop();
  }, [reduce, v]);

  const walking = phase === 'walk';
  return (
    <View style={{ height: stageH, width }} accessible accessibilityRole="image" accessibilityLabel="Cynct logo with Senti leaning on it, arms crossed">
      <Animated.View style={{ position: 'absolute', left: logoLeft, bottom: 0, transform: [{ scale: v.pop }] }}>
        <Logo size={logo} bg="#1E1647" />
      </Animated.View>
      <Animated.View style={{ position: 'absolute', left: restLeft, bottom: 0, width: senti, height: senti * 1.25, transformOrigin: '50% 96%',
        transform: [
          { translateX: v.x },
          // A little bob with each step while walking.
          { translateY: walking ? step.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -5, 0] }) : 0 },
          { rotate: v.lean.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-11deg'] }) },
        ] }}>
        <Senti size={senti} face="smile" arms={walking ? 'rest' : 'crossed'}
          legs={walking ? step.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '14deg'] }) : undefined}
          left={walking ? step.interpolate({ inputRange: [0, 1], outputRange: ['16deg', '-16deg'] }) : undefined}
          right={walking ? step.interpolate({ inputRange: [0, 1], outputRange: ['-16deg', '16deg'] }) : undefined} />
      </Animated.View>
    </View>
  );
}
