// K account view: balance and its last 30 days on the gradient, quick actions, and the account's entries by day.
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Polyline } from 'react-native-svg';
import { useData } from '../../data/DataContext';
import { useTheme } from '../../theme';
import { Button, Empty, Icon, List, Screen, T } from '../../components/ui';
import { GlassIcon, KHeader, KSheet, OnNight } from '../../components/k';
import { TxRow } from '../../components/domain';
import { isLiability, txDeltas } from '../../lib/ledger';
import { money } from '../../lib/currency';
import { addDays, dayLabel, todayISO } from '../../lib/money';
import { ACCOUNT_TYPES } from '../../lib/seed';

const PAGE = 60;

export default function AccountView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { data, balances } = useData();
  const [shown, setShown] = useState(PAGE);
  const a = data.accounts.find(x => x.id === id);
  const txs = useMemo(() => data.transactions
    .filter(t => !t.deletedAt && (t.accountId === id || t.toAccountId === id))
    .sort((x, y) => (y.date + (y.time ?? '')).localeCompare(x.date + (x.time ?? ''))), [data.transactions, id]);

  // Balance at the end of each of the last 30 days, worked backwards from today's balance.
  const series = useMemo(() => {
    const today = todayISO();
    const now = balances.get(id) ?? 0;
    const byDay = new Map<string, number>();
    for (const t of txs) for (const [acc, v] of txDeltas(t)) if (acc === id) byDay.set(t.date, (byDay.get(t.date) ?? 0) + v);
    const out: number[] = [];
    let bal = now;
    for (const [d, v] of byDay) if (d > today) bal -= v; // future-dated entries aren't in "end of today"
    for (let k = 0; k < 30; k++) {
      const d = addDays(today, -k);
      out.unshift(bal);
      bal -= byDay.get(d) ?? 0;
    }
    return out;
  }, [txs, balances, id]);

  if (!a) return <Screen title="Account" back><Empty title="This account no longer exists" /></Screen>;
  const liab = isLiability(a.type);
  const bal = balances.get(a.id) ?? 0;
  const m = (v: number) => money(v, a.currency);
  const W = 340, H = 56;
  const lo = Math.min(...series), hi = Math.max(...series);
  const pts = series.map((v, i) => `${(i / (series.length - 1)) * W},${H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 8)}`).join(' ');

  const groups: { date: string; items: typeof txs }[] = [];
  for (const t of txs.slice(0, shown)) {
    const g = groups[groups.length - 1];
    if (g && g.date === t.date) g.items.push(t); else groups.push({ date: t.date, items: [t] });
  }
  const actions: [string, string, string, () => void][] = [
    ['Spend', 'arrow-up', c.tMagenta, () => router.push({ pathname: '/tx/[id]', params: { id: 'new', type: 'expense', account: a.id } })],
    ['Income', 'arrow-down', c.tGreen, () => router.push({ pathname: '/tx/[id]', params: { id: 'new', type: 'income', account: a.id } })],
    ['Move', 'swap-horizontal', c.tViolet, () => router.push({ pathname: '/transfer/[id]', params: { id: 'new', from: a.id } })],
    ['Correct', 'scale-balance', c.tBlue, () => router.push(`/account/${a.id}`)],
  ];

  return (
    <Screen headerless edge padBottom={40}>
      <KHeader title="" back right={<GlassIcon name="pencil-outline" label="Edit account" onPress={() => router.push(`/account/${a.id}`)} />}>
        <OnNight style={{ marginTop: 6 }}>{`${a.name} · ${ACCOUNT_TYPES[a.type]}${a.currency !== 'PHP' ? ` · ${a.currency}` : ''}`}</OnNight>
        <T v="display" color="#FFFFFF" style={{ fontSize: 46, lineHeight: 54 }} numberOfLines={1}>{liab ? m(Math.max(0, -bal)) : m(bal)}</T>
        {liab ? <OnNight v="xs">owed</OnNight> : null}
        <View style={{ marginTop: 10 }} accessible accessibilityLabel={`Balance over the last 30 days, from ${m(series[0])} to ${m(series[series.length - 1])}`}>
          <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            <Polyline points={pts} fill="none" stroke="#FFFFFF" strokeWidth={2.5} strokeLinejoin="round" />
          </Svg>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><OnNight v="xs">30 days ago</OnNight><OnNight v="xs">Today</OnNight></View>
        </View>
      </KHeader>
      <KSheet>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {actions.map(([label, icon, bg, run]) => (
            <Pressable key={label} onPress={run} accessibilityRole="button" accessibilityLabel={label} style={{ alignItems: 'center', gap: 6, flex: 1 }}>
              <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={24} color={c.ink} /></View>
              <T v="semi" style={{ fontSize: 12 }}>{label}</T>
            </Pressable>
          ))}
        </View>
        {groups.length ? groups.map(g => {
          const net = g.items.reduce((x, t) => x + txDeltas(t).filter(([acc]) => acc === a.id).reduce((y, [, v]) => y + v, 0), 0);
          return (
            <View key={g.date}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, marginBottom: 8, marginHorizontal: 4 }}>
                <T v="semi" color={c.muted}>{g.date === todayISO() ? 'Today' : dayLabel(g.date)}</T>
                <T v="medium" color={net > 0 ? c.income : c.muted}>{`${net > 0 ? '+' : net < 0 ? '−' : ''}${m(Math.abs(net))}`}</T>
              </View>
              <List>{g.items.map(t => <TxRow key={t.id} t={t} />)}</List>
            </View>
          );
        }) : <View style={{ marginTop: 20 }}><Empty icon="history" title="Nothing here yet" text="Entries for this account show up here." /></View>}
        {txs.length > shown ? <Button variant="secondary" label="Show more" style={{ marginTop: 14 }} onPress={() => setShown(shown + PAGE)} /> : null}
      </KSheet>
    </Screen>
  );
}
