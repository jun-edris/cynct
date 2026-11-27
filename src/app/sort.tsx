// K "Sort your payments": captured payments one at a time, as a card you swipe right to add or left to skip.
import React, { useMemo, useState } from 'react';
import { Animated, PanResponder, Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useData } from '../data/DataContext';
import { useTheme } from '../theme';
import { Chip, Empty, Icon, Screen, T } from '../components/ui';
import { SentiBadge } from '../components/k';
import { haptic } from '../components/motion';
import { draftsFrom, readCapture, type CapturePrefs } from '../data/capture';
import { appName, useDraft, when } from '../data/useDraft';
import { money } from '../lib/currency';
import type { Draft } from '../lib/capture';

export default function Sort() {
  const { c } = useTheme();
  const { data } = useData();
  const prefs = readCapture(data.settings);
  const { drafts } = useMemo(() => draftsFrom(data.captured, prefs), [data.captured, prefs]);
  const [total] = useState(drafts.length);
  const done = Math.max(0, total - drafts.length);
  const d = drafts[0];

  return (
    <Screen title="Sort your payments" subtitle={d ? `${done + 1} of ${Math.max(total, drafts.length)} · from your notifications and screenshots` : undefined} back padBottom={30}>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: c.sunk, overflow: 'hidden' }}>
        <View style={{ width: `${total ? (done / total) * 100 : 100}%`, height: '100%', backgroundColor: c.mango, borderRadius: 3 }} />
      </View>
      {d ? <Deck key={d.id} d={d} prefs={prefs} more={drafts.length - 1} /> : (
        <View style={{ marginTop: 40, alignItems: 'center', gap: 12 }}>
          <SentiBadge size={72} />
          <Empty icon="check-all" title="All sorted" text="Nothing left to review. New payments show up here as they come in." action="Back to Home" onAction={() => router.back()} />
        </View>
      )}
    </Screen>
  );
}

function Deck({ d, prefs, more }: { d: Draft; prefs: CapturePrefs; more: number }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const { r, dup, planRow, settle, add, dismiss, edit, where } = useDraft(d, prefs);
  const [catId, setCatId] = useState<string | null>(r.categoryId);
  // JS-driven throughout: the drag uses Animated.event, which can't share a value with the native driver.
  const [pos] = useState(() => new Animated.ValueXY());

  // Category ideas: the guess first, then the categories you use most for this kind.
  const { data } = useData();
  const ideas = useMemo(() => {
    if (d.kind === 'transfer') return [];
    const kind = d.kind === 'income' ? 'income' : 'expense';
    const uses = new Map<string, number>();
    for (const t of data.transactions) if (!t.deletedAt && t.type === kind && t.categoryId) uses.set(t.categoryId, (uses.get(t.categoryId) ?? 0) + 1);
    const live = new Set(data.categories.filter(x => x.kind === kind && !x.archived).map(x => x.id));
    const top = [...uses.entries()].filter(([id]) => live.has(id)).sort((x, y) => y[1] - x[1]).map(([id]) => id);
    return [r.categoryId, ...top].filter((x, i, arr): x is string => !!x && arr.indexOf(x) === i).slice(0, 4);
  }, [d.kind, r.categoryId, data.transactions, data.categories]);

  const fly = (dir: 1 | -1, then: () => void) => {
    haptic(dir === 1 ? 'success' : 'select');
    Animated.timing(pos, { toValue: { x: dir * width * 1.3, y: 40 }, duration: 260, useNativeDriver: false }).start(then);
  };
  const doAdd = () => {
    if (dup) { fly(-1, () => dismiss()); return; }
    if (planRow) { fly(1, settle); return; }
    if (!r.tx) { edit(); return; }
    fly(1, () => add(catId));
  };
  const doSkip = () => fly(-1, () => dismiss());

  // Rebuilt each render so a swipe always uses the category you just picked.
  const pan = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => {
      if (g.dx > 110) doAdd();
      else if (g.dx < -110) doSkip();
      else Animated.spring(pos, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 6 }).start();
    },
  });

  const rotate = pos.x.interpolate({ inputRange: [-200, 0, 200], outputRange: ['-12deg', '0deg', '12deg'] });
  const addHint = pos.x.interpolate({ inputRange: [0, 110], outputRange: [0, 1], extrapolate: 'clamp' });
  const skipHint = pos.x.interpolate({ inputRange: [-110, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  const verb = d.kind === 'income' ? 'You got' : d.kind === 'transfer' ? 'You moved' : 'You paid';
  const [whole, cents] = money(d.amount, d.currency).split('.');

  return (
    <View style={{ marginTop: 22 }}>
      <View style={{ height: 440 }}>
        {more > 1 ? <View style={{ position: 'absolute', left: 18, right: 18, top: 24, bottom: -16, borderRadius: 32, backgroundColor: c.tMagenta, transform: [{ rotate: '4deg' }] }} /> : null}
        {more > 0 ? <View style={{ position: 'absolute', left: 8, right: 8, top: 12, bottom: -6, borderRadius: 32, backgroundColor: c.tBlue, transform: [{ rotate: '-3deg' }] }} /> : null}
        <Animated.View {...pan.panHandlers} style={{ position: 'absolute', inset: 0, borderRadius: 32, padding: 22, backgroundColor: c.surface,
          shadowColor: '#17122D', shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 14 }, elevation: 6,
          transform: [{ translateX: pos.x }, { translateY: pos.y }, { rotate }] }}>
          <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 18, left: 18, opacity: addHint, borderWidth: 2, borderColor: c.income, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, transform: [{ rotate: '-8deg' }] }}>
            <T v="semi" color={c.income}>{planRow ? 'MARK DONE' : dup ? 'SKIP' : 'ADD'}</T>
          </Animated.View>
          <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 18, right: 18, opacity: skipHint, borderWidth: 2, borderColor: c.spend, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, transform: [{ rotate: '8deg' }] }}>
            <T v="semi" color={c.spend}>SKIP</T>
          </Animated.View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.navy, alignItems: 'center', justifyContent: 'center' }}>
              <T v="h3" color="#8BF0BC">{appName(d.app ?? d.fromApp).slice(0, 1).toLowerCase()}</T>
            </View>
            <View style={{ flex: 1 }}><T v="semi">{where}</T><T v="small">{when(d.postedAt)}</T></View>
          </View>
          <View style={{ flex: 1 }} />
          <T v="muted">{verb}</T>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <T v="display" style={{ fontSize: 50, lineHeight: 58 }}>{whole}</T>
            {cents ? <T v="display" style={{ fontSize: 30, lineHeight: 40 }}>{`.${cents}`}</T> : null}
          </View>
          <T v="h2" numberOfLines={2} style={{ marginTop: 6 }}>{d.note}</T>
          {dup ? <T v="small" color={c.info} style={{ marginTop: 6 }}>Already in Cynct with the same amount. Swipe left to skip.</T>
            : planRow ? <T v="small" color={c.income} style={{ marginTop: 6 }}>{`Looks like ${planRow.name}. Swipe right to mark it ${planRow.kind === 'income' ? 'received' : 'paid'}.`}</T>
            : r.missing ? <T v="small" color={c.warn} style={{ marginTop: 6 }}>{`${r.missing}. Tap Edit to finish it.`}</T> : null}
          <View style={{ flex: 1 }} />
          {ideas.length && !planRow && !dup ? (
            <>
              <T v="small" style={{ marginBottom: 8 }}>Looks like</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {ideas.map(id => <CatChip key={id} id={id} on={catId === id} onPress={() => setCatId(id)} />)}
                {d.kind === 'expense' ? <Chip label="It’s a transfer" onPress={() => edit(true)} /> : null}
              </View>
            </>
          ) : null}
        </Animated.View>
      </View>
      <T v="small" center style={{ marginTop: 28 }}>Swipe right to add · left to skip</T>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 18, marginTop: 12 }}>
        <RoundButton size={64} icon="close" label="Skip" onPress={doSkip} outline />
        <RoundButton size={52} icon="pencil-outline" label="Edit" onPress={() => edit()} />
        <RoundButton size={80} icon="check" label={planRow ? 'Mark done' : 'Add'} onPress={doAdd} grad />
      </View>
    </View>
  );
}

function CatChip({ id, on, onPress }: { id: string; on: boolean; onPress: () => void }) {
  const { data } = useData();
  const cat = data.categories.find(x => x.id === id);
  if (!cat) return null;
  return <Chip label={cat.name} icon={cat.icon} selected={on} onPress={onPress} />;
}

function RoundButton({ size, icon, label, onPress, outline, grad }: { size: number; icon: string; label: string; onPress: () => void; outline?: boolean; grad?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }],
        backgroundColor: grad ? c.mango : outline ? 'transparent' : c.sunk, borderWidth: outline ? 2 : 0, borderColor: c.ink })}>
      <Icon name={icon} size={size * 0.42} color={grad ? '#FFFFFF' : c.ink} />
    </Pressable>
  );
}
