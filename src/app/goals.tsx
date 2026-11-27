import React from 'react';
import { Image, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useData, safeJson } from '../data/DataContext';
import { useTheme } from '../theme';
import { Glass, GlassIcon, KHeader, KSheet, OnNight, OnNightPill } from '../components/k';
import { Bar, Card, Empty, Icon, Screen, Section, T } from '../components/ui';
import { goalProgress, leftLabel } from '../lib/ledger';
import { compactPeso, dayLabel, peso, todayISO } from '../lib/money';

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
        <Glass style={{ marginTop: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <OnNight style={{ flex: 1 }}>Plan your next pay and move goal money in one tap.</OnNight>
          <OnNightPill label="Plan" onPress={() => router.push('/paycheck')} style={{ height: 34 }} />
        </Glass>
      </KHeader>
      <KSheet>

      <Section title="Your goals" style={{ marginTop: 0 }}>
        {all.length ? (
          <View style={{ gap: 12 }}>
            {all.map(({ g, p }) => (
              <Card key={g.id} onPress={() => router.push(`/goal/${g.id}`)} style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {g.photoUri ? <Image source={{ uri: g.photoUri }} style={{ width: 46, height: 46, borderRadius: 16 }} />
                    : <View style={{ width: 46, height: 46, borderRadius: 16, backgroundColor: g.color + '30', alignItems: 'center', justifyContent: 'center' }}><Icon name="flag-variant" size={22} color={g.color} /></View>}
                  <View style={{ flex: 1 }}>
                    <T v="semi">{g.name}</T>
                    <T v="small" color={p.pct >= 1 ? c.income : p.onTrack ? c.muted : c.warn}>
                      {p.pct >= 1 ? 'Reached' : p.onTrack ? `On track · ${leftLabel(p.months)}` : p.months < 1 ? `Needs ${compactPeso(p.needed)} by the deadline` : `Needs ${compactPeso(p.needed)} a month · by ${dayLabel(g.deadline)}`}
                    </T>
                  </View>
                  <T v="num" style={{ fontSize: 18 }}>{`${Math.round(p.pct * 100)}%`}</T>
                </View>
                <Bar pct={p.pct} color={g.color} height={10} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T v="small">{`${peso(p.saved, { cents: false })} saved${g.annualRate > 0 ? ` · ${g.annualRate / 100}% a year` : ''}`}</T>
                  <T v="small">{peso(g.target, { cents: false })}</T>
                </View>
              </Card>
            ))}
            <Pressable onPress={() => router.push('/goal-edit/new')} accessibilityRole="button"
              style={{ minHeight: 64, borderRadius: 22, borderWidth: 2, borderStyle: 'dashed', borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}>
              <T v="semi" color={c.muted}>+ New goal</T>
            </Pressable>
          </View>
        ) : <Empty icon="flag-outline" title="No goals yet" text="A house, an emergency fund, a trip. Cynct shows exactly how much to save each month." action="Create a goal" onAction={() => router.push('/goal-edit/new')} />}
      </Section>
      </KSheet>
    </Screen>
  );
}
