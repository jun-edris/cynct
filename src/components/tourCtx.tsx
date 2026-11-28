// The small shared part of guided tips: the context, <Spot> targets and the per-screen hook. Kept apart from
// the overlay (tour.tsx) so the basic screen component can use it without an import cycle.
import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { View, type HostInstance, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useData } from '../data/DataContext';
import { readTours, shouldAutoStart, type TourId } from '../lib/tours';

/** Scrolls by up to `dy` and returns how far it really went (it can't go above the top). */
export interface Scroller { scrollBy: (dy: number) => number }
export interface TourCtxValue {
  reg: (id: string, n: HostInstance) => void;
  unreg: (id: string, n: HostInstance) => void;
  setScroller: (s: Scroller | null) => void;
  start: (id: TourId) => void;
}
export const TourCtx = createContext<TourCtxValue | null>(null);
export const useTourCtx = () => useContext(TourCtx);
/** True while tips are on screen, so a screen can get things out of the way (like a keypad over the form). */
export const TourRunning = createContext(false);
export const useTourRunning = () => useContext(TourRunning);

/** Marks something a tip can light up. Renders a plain View, so pass the layout style it needs. */
export function Spot({ id, style, children }: { id: string; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const ctx = useContext(TourCtx);
  const ref = useRef<HostInstance>(null);
  useEffect(() => {
    const n = ref.current;
    if (!ctx || !n) return;
    ctx.reg(id, n);
    return () => ctx.unreg(id, n);
  }, [ctx, id]);
  return <View ref={ref} collapsable={false} style={style}>{children}</View>;
}

/**
 * Wires a screen to its tips: starts them by themselves the first time a new user opens the screen, and lets
 * the screen's scroll view follow the lit-up thing. Returns `start` for the screen's ? button.
 */
export function useScreenTour(id: TourId | undefined, scroller?: Scroller | null) {
  const ctx = useContext(TourCtx);
  const { data } = useData();
  const auto = id ? shouldAutoStart(readTours(data.settings), id) : false;
  const pending = !!data.settings.setupPending;
  const scrollRef = useRef(scroller);
  useEffect(() => { scrollRef.current = scroller; });
  useFocusEffect(useCallback(() => {
    if (!ctx || !id) return;
    ctx.setScroller(scrollRef.current ?? null);
    if (!auto || pending) return () => ctx.setScroller(null);
    const t = setTimeout(() => ctx.start(id), 900);
    return () => { clearTimeout(t); ctx.setScroller(null); };
  }, [ctx, id, auto, pending]));
  return useCallback(() => { if (ctx && id) ctx.start(id); }, [ctx, id]);
}
