import React from 'react';
import { Image, View } from 'react-native';
import { router } from 'expo-router';
import { useData, safeJson } from '../data/DataContext';
import { radius, useTheme } from '../theme';
import { Bar, Block, Button, Card, Empty, Ring, Screen, Section, T } from '../components/ui';
import { goalProgress } from '../lib/ledger';
import { compactPeso, peso, todayISO } from '../lib/money';

export default function Goals() {
  const { c } = useTheme();
  const { data, balances } = useData();
  const today = todayISO();
  const all = data.goals.filter(g => !g.archived).map(g => ({ g, p: goalProgress({ ...g, annualRate: g.annualRate / 10_000, accountIds: safeJson<string[]>(g.accountIds, []) }, balances, data.transactions, today) }));
  const saved = all.reduce((s, x) => s + x.p.saved, 0);
  const target = all.reduce((s, x) => s + x.g.target, 0);
  const done = all.filter(x => x.p.pct >= 1).length;

  return (
    <Screen title="Goals" subtitle="Set money aside and watch each goal fill up." back right={<Button small icon="plus" label="New" onPress={() => router.push('/goal-edit/new')} />}>
      <Block tone="navy">
        <T v="semi" color={c.navyMuted}>Saved across goals</T>
        <T v="display" color={c.navyText} style={{ marginTop: 4 }}>{peso(saved, { cents: false })}</T>
        <View style={{ marginTop: 12 }}><Bar pct={target ? saved / target : 0} track={c.navyLine} /></View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          {[['Active', String(all.length - done)], ['Completed', String(done)], ['Targeted', compactPeso(target)]].map(([l, v]) => (
            <View key={l} style={{ flex: 1, backgroundColor: c.navyLine, borderRadius: radius.md, padding: 12 }}>
              <T v="label" color={c.navyMuted}>{l}</T>
              <T v="num" color={c.navyText} style={{ fontSize: 18 }}>{v}</T>
            </View>
          ))}
        </View>
      </Block>

      <Section title="Your goals">
        {all.length ? (
          <View style={{ gap: 12 }}>
            {all.map(({ g, p }) => (
              <Card key={g.id} onPress={() => router.push(`/goal/${g.id}`)} style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                {g.photoUri ? <Image source={{ uri: g.photoUri }} style={{ width: 64, height: 64, borderRadius: 18 }} />
                  : <Ring pct={p.pct} size={64} stroke={7} color={g.color}><T v="num" style={{ fontSize: 14 }}>{Math.round(p.pct * 100)}%</T></Ring>}
                <View style={{ flex: 1, gap: 3 }}>
                  <T v="h3">{g.name}</T>
                  <T v="small">{peso(p.saved, { cents: false })} of {peso(g.target, { cents: false })}</T>
                  <T v="small" color={p.pct >= 1 ? c.income : p.onTrack ? c.income : c.warn}>
                    {p.pct >= 1 ? 'Reached' : p.onTrack ? `On track · ${p.monthsLeft} months left` : `Needs ${compactPeso(p.needed)}/mo`}
                  </T>
                </View>
                {g.annualRate > 0 ? <T v="label" color={c.income}>{g.annualRate / 100}%</T> : null}
              </Card>
            ))}
          </View>
        ) : <Empty icon="flag-outline" title="No goals yet" text="A house, an emergency fund, a trip. Bahay shows exactly how much to save each month." action="Create a goal" onAction={() => router.push('/goal-edit/new')} />}
      </Section>
    </Screen>
  );
}
