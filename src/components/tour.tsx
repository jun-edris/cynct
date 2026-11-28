// Guided tips on top of any screen: dims the screen, lights up one thing at a time (a <Spot>), and Senti
// explains it in a bubble with Skip, Back and Next. Steps live in src/lib/tours.ts.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, View, useWindowDimensions, type HostInstance } from 'react-native';
import Svg, { Path, Rect as SvgRect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useData } from '../data/DataContext';
import { setSetting } from '../db/repo';
import { TOURS, markSeen, placeBubble, readTours, scrollNeeded, type Rect, type TourId } from '../lib/tours';
import { useTheme } from '../theme';
import { Icon, T } from './ui';
import { GlassIcon, SentiBadge } from './k';
import { haptic } from './motion';
import { TourCtx, TourRunning, useTourCtx, type Scroller, type TourCtxValue } from './tourCtx';

export { Spot, useScreenTour, useTourRunning } from './tourCtx';
type Node = HostInstance;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

export function TourProvider({ children }: { children: React.ReactNode }) {
  const targets = useRef(new Map<string, Node>());
  const scroller = useRef<Scroller | null>(null);
  const [run, setRun] = useState<{ id: TourId; i: number; rect: Rect | null } | null>(null);
  // A tour already on screen ignores new starts (a screen re-focusing must not restart it).
  const busy = useRef(false);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { act, data } = useData();
  const settingsRef = useRef(data.settings);
  useEffect(() => { settingsRef.current = data.settings; });

  const measure = useCallback((id?: string) => new Promise<Rect | null>(res => {
    const n = id ? targets.current.get(id) : undefined;
    if (!n) { res(null); return; }
    n.measureInWindow((x, y, w, h) => res(w > 0 && h > 0 ? { x, y, w, h } : null));
  }), []);

  const show = useCallback(async (id: TourId, i: number) => {
    const step = TOURS[id][i];
    let rect = await measure(step.target);
    if (rect && scroller.current) {
      const dy = scrollNeeded(rect, height, insets.top, insets.bottom);
      const went = dy ? scroller.current.scrollBy(dy) : 0;
      if (went) {
        await wait(420);
        const moved = await measure(step.target);
        // Didn't move: it's pinned (like the + button), so the scroll was for nothing. Put it back.
        if (moved && rect && Math.abs(moved.y - rect.y) < 4) scroller.current.scrollBy(-went);
        else rect = moved;
      }
    }
    setRun({ id, i, rect });
  }, [measure, height, insets.top, insets.bottom]);

  const finish = useCallback((id: TourId) => {
    busy.current = false;
    setRun(null);
    const s = readTours(settingsRef.current);
    act(db => setSetting(db, 'tours', markSeen(s, id)));
  }, [act]);

  const reg = useCallback((id: string, n: Node) => { targets.current.set(id, n); }, []);
  const unreg = useCallback((id: string, n: Node) => { if (targets.current.get(id) === n) targets.current.delete(id); }, []);
  const setScroller = useCallback((s: Scroller | null) => { scroller.current = s; }, []);
  const start = useCallback((id: TourId) => {
    if (busy.current) return;
    busy.current = true;
    haptic('select');
    show(id, 0);
  }, [show]);
  // Stable, so screens' focus effects don't re-run (and re-start tips) every time this provider renders.
  const ctx = useMemo<TourCtxValue>(() => ({ reg, unreg, setScroller, start }), [reg, unreg, setScroller, start]);

  return (
    <TourCtx.Provider value={ctx}>
      <TourRunning.Provider value={!!run}>{children}</TourRunning.Provider>
      {run ? <Overlay id={run.id} i={run.i} rect={run.rect}
        onNext={() => (run.i + 1 < TOURS[run.id].length ? show(run.id, run.i + 1) : finish(run.id))}
        onBack={() => show(run.id, Math.max(0, run.i - 1))}
        onSkip={() => finish(run.id)} /> : null}
    </TourCtx.Provider>
  );
}

function Overlay({ id, i, rect, onNext, onBack, onSkip }: { id: TourId; i: number; rect: Rect | null; onNext: () => void; onBack: () => void; onSkip: () => void }) {
  const { c } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const steps = TOURS[id];
  const step = steps[i];
  const last = i === steps.length - 1;
  const [bubbleH, setBubbleH] = useState(220);
  const pad = 8;
  const hole = rect ? { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 } : null;
  const r = 16;
  const cut = hole
    ? ` M${hole.x + r} ${hole.y} h${hole.w - 2 * r} a${r} ${r} 0 0 1 ${r} ${r} v${hole.h - 2 * r} a${r} ${r} 0 0 1 ${-r} ${r} h${-(hole.w - 2 * r)} a${r} ${r} 0 0 1 ${-r} ${-r} v${-(hole.h - 2 * r)} a${r} ${r} 0 0 1 ${r} ${-r} Z`
    : '';
  const pos = placeBubble(hole && { ...hole }, height, bubbleH, insets.top, insets.bottom);

  return (
    <Modal transparent statusBarTranslucent navigationBarTranslucent animationType="fade" visible onRequestClose={onSkip}>
      <View style={{ flex: 1 }} accessibilityViewIsModal>
        <Svg width={width} height={height} style={{ position: 'absolute' }}>
          <Path d={`M0 0 H${width} V${height} H0 Z${cut}`} fill="#130D2E" fillOpacity={0.78} fillRule="evenodd" />
          {hole ? <SvgRect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx={r} fill="none" stroke="#FFFFFF" strokeWidth={2} strokeDasharray="6 5" /> : null}
        </Svg>
        <View onLayout={e => setBubbleH(e.nativeEvent.layout.height)}
          style={{ position: 'absolute', left: 16, right: 16, top: pos.y, backgroundColor: c.surface, borderRadius: 24, padding: 16, gap: 10,
            shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <SentiBadge size={40} />
            <T v="h3" style={{ flex: 1 }}>{step.title}</T>
          </View>
          <T v="body" style={{ fontSize: 16, lineHeight: 23 }}>{step.text}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <T v="small" style={{ flex: 1 }}>{`${i + 1} of ${steps.length}`}</T>
            {!last ? <Btn label="Skip" onPress={onSkip} plain /> : null}
            {i > 0 ? <Btn label="Back" onPress={onBack} plain /> : null}
            <Btn label={last ? 'Got it' : 'Next'} onPress={onNext} />
          </View>
        </View>
        {/* Keeps the bubble from feeling like a wall: a tiny hint of where the lit thing is. */}
        {hole && pos.side !== 'center' ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: Math.min(width - 40, Math.max(24, hole.x + hole.w / 2 - 8)),
            top: pos.side === 'below' ? pos.y - 10 : pos.y + bubbleH - 6, width: 16, height: 16, backgroundColor: c.surface, transform: [{ rotate: '45deg' }] }} />
        ) : null}
      </View>
    </Modal>
  );
}

function Btn({ label, onPress, plain }: { label: string; onPress: () => void; plain?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
      style={({ pressed }) => ({ height: 44, paddingHorizontal: plain ? 12 : 20, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
        backgroundColor: plain ? 'transparent' : c.mango, opacity: pressed ? 0.8 : 1 })}>
      <T v="semi" color={plain ? c.inkSoft : '#FFFFFF'}>{label}</T>
    </Pressable>
  );
}

/** The ? button that replays a screen's tips, for the gradient headers. (Plain <Screen> headers add their own.) */
export function TourHelp({ id }: { id: TourId }) {
  const ctx = useTourCtx();
  if (!ctx) return null;
  return <GlassIcon name="help-circle-outline" label="Show tips for this screen" onPress={() => ctx.start(id)} />;
}

/** Small inline link version, for screens without a header slot. */
export function TourLink({ id }: { id: TourId }) {
  const ctx = useTourCtx();
  const { c } = useTheme();
  if (!ctx) return null;
  return (
    <Pressable onPress={() => ctx.start(id)} accessibilityRole="button" accessibilityLabel="Show tips for this screen" hitSlop={8}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon name="help-circle-outline" size={18} color={c.mango} />
      <T v="small" color={c.mango}>Tips</T>
    </Pressable>
  );
}
