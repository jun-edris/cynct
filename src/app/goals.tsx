import React from 'react';
import { Image, View } from 'react-native';
import { router } from 'expo-router';
import { useData, safeJson } from '../data/DataContext';
import { useTheme } from '../theme';
import { Glass, GlassIcon, KHeader, KSheet, OnNight } from '../components/k';
import { Bar, Card, Empty, Ring, Screen, Section, T } from '../components/ui';
import { goalProgress, leftLabel } from '../lib/ledger';
import { compactPeso, peso, todayISO } from '../lib/money';

export default function Goals() {
  const { c } = useTheme();
  const { data, baseBalances, rtx } = useData();
  const today = todayISO();
  const all = data.goals.filter(g => !g.archived).map(g => ({ g, p: goalProgress({ ...g, annualRate: g.annualRate / 10_000, accountIds: safeJson<string[]>(g.accountIds, []) }, baseBalances, rtx, today) }));
  const saved = all.reduce((s, x) => s + x.p.saved, 0);
  const target = all.reduce((s, x) => s + x.g.target, 0);
  const done = all.filter(x => x.p.pct >= 1).length;

  return (
    <Screen headerless edge>
      <KHeader title="Goals" back right={<GlassIcon name="plus" label="New goal" onPress={() => router.push('/goal-edit/new')} />}>
        <OnNight style={{ marginTop: 12 }}>Saved across goals</OnNight>
        <T v="display" color="#FFFFFF" style={{ fontSize: 46, lineHeight: 54 }}>{peso(saved, { cents: false })}</T>
        <View style={{ marginTop: 10 }}><Bar pct={target ? saved / target : 0} color={c.amber} track="rgba(255,255,255,0.2)" /></View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {[['Active', String(all.length - done)], ['Completed', String(done)], ['Targeted', compactPeso(target)]].map(([l, v]) => (
            <Glass key={l} style={{ flex: 1, padding: 10 }}>
              <OnNight v="xs">{l}</OnNight>
              <T v="num" color="#FFFFFF" style={{ fontSize: 18 }}>{v}</T>
            </Glass>
          ))}
        </View>
      </KHeader>
      <KSheet>

      <Section title="Your goals" style={{ marginTop: 0 }}>
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
                    {p.pct >= 1 ? 'Reached' : p.onTrack ? `On track · ${leftLabel(p.months)}` : p.months < 1 ? `Needs ${compactPeso(p.needed)} by the deadline` : `Needs ${compactPeso(p.needed)}/mo`}
                  </T>
                </View>
                {g.annualRate > 0 ? <T v="label" color={c.income}>{g.annualRate / 100}%</T> : null}
              </Card>
            ))}
          </View>
        ) : <Empty icon="flag-outline" title="No goals yet" text="A house, an emergency fund, a trip. Cynct shows exactly how much to save each month." action="Create a goal" onAction={() => router.push('/goal-edit/new')} />}
      </Section>
      </KSheet>
    </Screen>
  );
}
