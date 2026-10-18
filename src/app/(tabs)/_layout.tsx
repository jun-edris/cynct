import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Redirect, Tabs, router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useData } from '../../data/DataContext';
import { fonts, radius, useTheme } from '../../theme';
import { Icon, IconBubble, Sheet, T } from '../../components/ui';

const TABS = [
  { path: '/', label: 'Home', icon: 'home-variant-outline', on: 'home-variant' },
  { path: '/wallet', label: 'Wallet', icon: 'wallet-outline', on: 'wallet' },
  { path: '/plan', label: 'Plan', icon: 'compass-outline', on: 'compass' },
  { path: '/history', label: 'History', icon: 'history', on: 'history' },
] as const;

function AddMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { c } = useTheme();
  const go = (href: Parameters<typeof router.push>[0]) => { onClose(); setTimeout(() => router.push(href), 60); };
  const tiles: { label: string; sub: string; icon: string; color: string; onPress: () => void }[] = [
    { label: 'Expense', sub: 'Money you spent', icon: 'arrow-up', color: c.spend, onPress: () => go({ pathname: '/tx/[id]', params: { id: 'new', type: 'expense' } }) },
    { label: 'Income', sub: 'Money you earned', icon: 'arrow-down', color: c.income, onPress: () => go({ pathname: '/tx/[id]', params: { id: 'new', type: 'income' } }) },
    { label: 'Transfer', sub: 'Between accounts or people', icon: 'swap-horizontal', color: c.info, onPress: () => go({ pathname: '/transfer/[id]', params: { id: 'new' } }) },
    { label: 'Type it', sub: '“lunch 180 gcash”', icon: 'message-text-outline', color: c.mango, onPress: () => go('/quick') },
  ];
  return (
    <Sheet visible={open} onClose={onClose} title="Add">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 6 }}>
        {tiles.map(t => (
          <Pressable key={t.label} onPress={t.onPress} accessibilityRole="button" accessibilityLabel={t.label}
            style={({ pressed }) => ({ width: '48.5%', backgroundColor: c.surface, borderRadius: radius.lg, padding: 16, gap: 12, opacity: pressed ? 0.8 : 1 })}>
            <IconBubble icon={t.icon} color={t.color} size={44} />
            <View><T v="h3">{t.label}</T><T v="small">{t.sub}</T></View>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.sunk, borderRadius: radius.md, padding: 14, marginTop: 4 }}>
        <Icon name="receipt-text-outline" color={c.muted} />
        <T v="small" style={{ flex: 1 }}>Receipt scanning arrives in the next build.</T>
      </View>
    </Sheet>
  );
}

function TabBar() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const item = (t: (typeof TABS)[number]) => {
    const on = pathname === t.path;
    return (
      <Pressable key={t.path} onPress={() => router.navigate(t.path)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, height: 56 }}>
        <Icon name={on ? t.on : t.icon} size={24} color={on ? c.ink : c.faint} />
        <T v="label" color={on ? c.ink : c.faint} style={{ fontFamily: on ? fonts.bold : fonts.medium, fontSize: 11.5 }}>{t.label}</T>
      </Pressable>
    );
  };
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, paddingBottom: insets.bottom + 10 }} pointerEvents="box-none">
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: radius.xl, paddingHorizontal: 6,
        shadowColor: '#0B1426', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 10 }}>
        {item(TABS[0])}{item(TABS[1])}
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Add a transaction"
          style={({ pressed }) => ({ width: 58, height: 58, borderRadius: 29, backgroundColor: c.mango, alignItems: 'center', justifyContent: 'center',
            marginHorizontal: 6, marginTop: -26, borderWidth: 5, borderColor: c.bg, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
          <Icon name="plus" size={30} color={c.onMango} />
        </Pressable>
        {item(TABS[2])}{item(TABS[3])}
      </View>
      <AddMenu open={open} onClose={() => setOpen(false)} />
    </View>
  );
}

export default function TabsLayout() {
  const { data } = useData();
  if (!data.settings.setupDone) return <Redirect href="/welcome" />;
  return (
    <Tabs tabBar={() => <TabBar />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="wallet" />
      <Tabs.Screen name="plan" />
      <Tabs.Screen name="history" />
    </Tabs>
  );
}
