import React, { useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { Redirect, Tabs, router, usePathname } from 'expo-router';
import { Spot } from '../../components/tour';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useData } from '../../data/DataContext';
import { fonts, radius, useTheme } from '../../theme';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Chip, Grid, Icon, IconBubble, Sheet, T } from '../../components/ui';
import { useApplyTemplate } from '../../data/actions';
import { Squish, SPRING, haptic, useSpring } from '../../components/motion';

const TABS = [
  { path: '/', label: 'Home', icon: 'home-variant-outline', on: 'home-variant' },
  { path: '/wallet', label: 'Wallet', icon: 'wallet-outline', on: 'wallet' },
  { path: '/plan', label: 'Plan', icon: 'compass-outline', on: 'compass' },
  { path: '/history', label: 'History', icon: 'history', on: 'history' },
] as const;

function AddMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { c } = useTheme();
  const { data } = useData();
  const apply = useApplyTemplate();
  const go = (href: Parameters<typeof router.push>[0]) => { onClose(); setTimeout(() => router.push(href), 60); };
  const tiles: { label: string; sub: string; icon: string; color: string; onPress: () => void }[] = [
    { label: 'Expense', sub: 'Money you spent', icon: 'arrow-up', color: c.spend, onPress: () => go({ pathname: '/tx/[id]', params: { id: 'new', type: 'expense' } }) },
    { label: 'Income', sub: 'Money you earned', icon: 'arrow-down', color: c.income, onPress: () => go({ pathname: '/tx/[id]', params: { id: 'new', type: 'income' } }) },
    { label: 'Transfer', sub: 'Between accounts or people', icon: 'swap-horizontal', color: c.info, onPress: () => go({ pathname: '/transfer/[id]', params: { id: 'new' } }) },
    { label: 'Type it', sub: '“lunch 180 gcash”', icon: 'message-text-outline', color: c.mango, onPress: () => go('/quick') },
    { label: 'Scan receipt', sub: 'Reads the total for you', icon: 'line-scan', color: '#8B6CFF', onPress: () => go('/scan') },
    { label: 'Templates', sub: data.templates.length ? `${data.templates.length} saved` : 'One-tap repeat entries', icon: 'bookmark-outline', color: '#FF5C8A', onPress: () => go('/templates') },
  ];
  return (
    <Sheet visible={open} onClose={onClose} title="Add">
      <Grid>
        {tiles.map(t => (
          <Squish key={t.label} onPress={t.onPress} accessibilityRole="button" accessibilityLabel={t.label} outer={{ flexGrow: 1 }} scale={0.96} radius={radius.lg} pressedRadius={radius.md}
            style={{ flexGrow: 1, backgroundColor: c.surface, padding: 16, gap: 12 }}>
            <IconBubble icon={t.icon} color={t.color} size={44} />
            <View><T v="h3">{t.label}</T><T v="small">{t.sub}</T></View>
          </Squish>
        ))}
      </Grid>
      <View style={{ height: 6 }} />
      {data.templates.length ? (
        <View style={{ gap: 8, marginTop: 6 }}>
          <T v="label">Quick add</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {data.templates.slice(0, 8).map(t => <Chip key={t.id} icon={t.type === 'income' ? 'arrow-down' : t.type === 'transfer' ? 'swap-horizontal' : 'arrow-up'} label={t.name}
              onPress={() => { onClose(); setTimeout(() => apply(t.id), 60); }} />)}
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

/** K navigation item: icon over label, with a soft violet pill that springs open behind the active icon. */
function TabItem({ t, on }: { t: (typeof TABS)[number]; on: boolean }) {
  const { c } = useTheme();
  const k = useSpring(on ? 1 : 0, SPRING.fastSpatial);
  return (
    <Pressable onPress={() => { if (!on) haptic('select'); router.navigate(t.path); }} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, height: 70 }}>
      <Animated.View style={{ width: k.interpolate({ inputRange: [0, 1], outputRange: [30, 54] }), height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
        backgroundColor: on ? c.tViolet : 'transparent' }}>
        <Icon name={on ? t.on : t.icon} size={22} color={on ? c.ink : c.faint} />
      </Animated.View>
      <T v="label" color={on ? c.ink : c.faint} style={{ fontFamily: on ? fonts.bold : fonts.medium, fontSize: 11 }}>{t.label}</T>
    </Pressable>
  );
}

function Fab({ onPress }: { onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => { haptic(); onPress(); }} accessibilityRole="button" accessibilityLabel="Add an entry"
      style={({ pressed }) => ({ width: 72, height: 72, borderRadius: 36, marginTop: -36, marginHorizontal: 2, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center',
        transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      <View style={{ width: 60, height: 60, borderRadius: 30, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
        shadowColor: c.violet, shadowOpacity: 0.6, shadowRadius: 14, shadowOffset: { width: 0, height: 10 }, elevation: 8 }}>
        <Svg width={60} height={60} style={{ position: 'absolute' }}>
          <Defs><LinearGradient id="fab" x1="0" y1="0" x2="1" y2="0.5"><Stop offset="0" stopColor={c.gradFrom} /><Stop offset="0.45" stopColor={c.gradMid} /><Stop offset="1" stopColor={c.gradTo} /></LinearGradient></Defs>
          <Rect x={0} y={0} width={60} height={60} fill="url(#fab)" />
        </Svg>
        <Icon name="plus" size={30} color="#FFFFFF" />
      </View>
    </Pressable>
  );
}

function TabBar() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const item = (t: (typeof TABS)[number]) => <TabItem key={t.path} t={t} on={pathname === t.path} />;
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingBottom: insets.bottom + 12 }} pointerEvents="box-none">
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: 30, borderWidth: 1, borderColor: c.line, height: 70,
        shadowColor: '#17122D', shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 10 }}>
        {item(TABS[0])}{item(TABS[1])}
        <Spot id="tabs.add"><Fab onPress={() => setOpen(true)} /></Spot>
        {item(TABS[2])}{item(TABS[3])}
      </View>
      <AddMenu open={open} onClose={() => setOpen(false)} />
    </View>
  );
}

export default function TabsLayout() {
  const { data } = useData();
  if (!data.settings.setupDone) return <Redirect href="/welcome" />;
  // Closed the app halfway through setup: pick it up where it was.
  if (data.settings.setupPending) return <Redirect href="/setup" />;
  return (
    <Tabs tabBar={() => <TabBar />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="wallet" />
      <Tabs.Screen name="plan" />
      <Tabs.Screen name="history" />
    </Tabs>
  );
}
