// Material 3 Expressive motion, on React Native's own Animated API.
// Springs use Material's published tokens: spatial springs (position, size, shape) overshoot a touch,
// effects springs (color, opacity) never do. Fast = small parts like buttons; default = sheets; slow = full screen.
import React, { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';

const spring = (stiffness: number, dampingRatio: number) => ({ stiffness, damping: 2 * dampingRatio * Math.sqrt(stiffness), mass: 1 });
export const SPRING = {
  fastSpatial: spring(1400, 0.9), fastEffects: spring(3800, 1),
  defaultSpatial: spring(700, 0.9), defaultEffects: spring(1600, 1),
  slowSpatial: spring(300, 0.9), slowEffects: spring(800, 1),
};

/** Light touch feedback. Silent on the web preview and on phones without a vibration motor. */
export function haptic(kind: 'tap' | 'select' | 'success' | 'warn' = 'tap') {
  if (Platform.OS === 'web') return;
  const p = kind === 'select' ? Haptics.selectionAsync()
    : kind === 'success' ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    : kind === 'warn' ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  p.catch(() => {});
}

/** A value that springs to `to` whenever it changes. */
export function useSpring(to: number, cfg = SPRING.fastSpatial) {
  const [v] = useState(() => new Animated.Value(to));
  useEffect(() => { Animated.spring(v, { toValue: to, ...cfg, useNativeDriver: false }).start(); }, [to, v, cfg]);
  return v;
}

/**
 * Pressable that squishes and morphs its corners on press, the M3 Expressive way: buttons get squarer,
 * keys get rounder. `outer` takes layout (flex, margins); `style` takes the look.
 */
export function Squish({ children, style, outer, radius, pressedRadius, scale = 0.96, feedback = 'tap', onPressIn, onPressOut, onPress, disabled, ...rest }:
  Omit<PressableProps, 'style' | 'children'> & {
    children: React.ReactNode; style?: StyleProp<ViewStyle>; outer?: StyleProp<ViewStyle>;
    radius?: number; pressedRadius?: number; scale?: number; feedback?: 'tap' | 'select' | null;
  }) {
  const [v] = useState(() => new Animated.Value(0));
  const go = (to: number) => Animated.spring(v, { toValue: to, ...SPRING.fastSpatial, useNativeDriver: false }).start();
  const s = v.interpolate({ inputRange: [0, 1], outputRange: [1, scale] });
  const r = radius !== undefined && pressedRadius !== undefined ? v.interpolate({ inputRange: [0, 1], outputRange: [radius, pressedRadius] }) : radius;
  return (
    <Pressable {...rest} disabled={disabled} style={outer}
      onPressIn={(e) => { go(1); onPressIn?.(e); }} onPressOut={(e) => { go(0); onPressOut?.(e); }}
      onPress={(e) => { if (feedback) haptic(feedback); onPress?.(e); }}>
      <Animated.View style={[style, r !== undefined ? { borderRadius: r } : null, { transform: [{ scale: s }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
