import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useData } from '../data/DataContext';
import { useTheme } from '../theme';
import { GlassIcon, KHeader, KSheet, OnNight } from '../components/k';
import { Spot, TourHelp } from '../components/tour';
import { Bar, Card, Empty, IconBubble, Screen, Segmented, T } from '../components/ui';
import { budgetStatus } from '../lib/ledger';
import { peso, todayISO } from '../lib/money';
import { PERIOD_WORD } from '../lib/labels';


export default function Budgets() {
  const { c } = useTheme();
  const { data, cats, catById, rtx } = useData();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const today = todayISO();
  const list = data.budgets.filter(b => (b.kind ?? 'expense') === kind).map(b => ({ b, s: budgetStatus(b, rtx, cats, today) }));
  const used = list.reduce((s, x) => s + x.s.spent, 0);
  const avail = list.reduce((s, x) => s + x.s.available, 0);

  return (
    <Screen headerless edge tour="budgets">
      <KHeader title="Budgets" back right={<>
        <TourHelp id="budgets" />
        <Spot id="budgets.add"><GlassIcon name="plus" label="New budget" onPress={() => router.push({ pathname: '/budget/[id]', params: { id: 'new', kind } })} /></Spot>
      </>}>
        <OnNight style={{ marginTop: 12 }}>{kind === 'income' ? 'Earned toward targets' : 'Left in your budgets'}</OnNight>
        <T v="display" color={kind !== 'income' && avail - used < 0 ? '#FF9CCB' : '#FFFFFF'} style={{ fontSize: 46, lineHeight: 54 }}>{peso(kind === 'income' ? used : avail - used, { cents: false })}</T>
        <OnNight v="xs">{avail ? `${peso(used, { cents: false })} ${kind === 'income' ? 'earned' : 'spent'} of ${peso(avail, { cents: false })} for each budget’s current period` : 'No budgets here yet'}</OnNight>
        {avail ? <View style={{ height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 12, backgroundColor: 'rgba(255,255,255,0.2)' }}>
          <View style={{ width: `${Math.min(100, (used / avail) * 100)}%`, height: '100%', backgroundColor: '#FFFFFF', borderRadius: 5 }} />
        </View> : null}
      </KHeader>
      <KSheet>
      <Spot id="budgets.kind"><Segmented value={kind} onChange={setKind} options={[['expense', 'Spending limits', 'arrow-up'], ['income', 'Income targets', 'arrow-down']]} /></Spot>
      <Spot id="budgets.list" style={{ marginTop: 16 }}>
        {list.length ? (
          <View style={{ gap: 10 }}>
            {list.map(({ b, s }) => {
              const cat = b.categoryId ? catById.get(b.categoryId) : undefined;
              const good = kind === 'income' ? s.remaining <= 0 : s.remaining >= 0;
              const perDay = kind === 'expense' && s.remaining > 0 && s.daysLeft > 1 ? `${peso(Math.floor(s.remaining / s.daysLeft), { cents: false })} a day for ${s.daysLeft} days` : null;
              return (
                <Card key={b.id} onPress={() => router.push(`/budget/${b.id}`)} style={{ gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <IconBubble icon={cat?.icon ?? (kind === 'income' ? 'cash-plus' : 'wallet-outline')} color={cat?.color ?? c.mango} />
                    <View style={{ flex: 1 }}>
                      <T v="semi">{b.name}</T>
                      <T v="small">{perDay ?? `${PERIOD_WORD[b.period]}${b.rollover ? ' · rolls over' : ''}`}</T>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <T v="num" color={good ? c.ink : c.spend} style={{ fontSize: 18 }}>{peso(Math.abs(s.remaining), { cents: false })}</T>
                      <T v="small">{kind === 'income' ? (s.remaining <= 0 ? 'reached' : 'to go') : s.remaining < 0 ? 'over' : 'left'}</T>
                    </View>
                  </View>
                  <Bar pct={s.pct} over={kind === 'expense' && s.remaining < 0} color={kind === 'income' ? c.income : cat?.color} />
                  <T v="small">{`${peso(s.spent, { cents: false })} of ${peso(s.available, { cents: false })}${s.carry ? ` · ${peso(s.carry, { sign: true, cents: false })} carried` : ''}`}</T>
                </Card>
              );
            })}
            <Pressable onPress={() => router.push({ pathname: '/budget/[id]', params: { id: 'new', kind } })} accessibilityRole="button"
              style={{ minHeight: 60, borderRadius: 22, borderWidth: 2, borderStyle: 'dashed', borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}>
              <T v="semi" color={c.muted}>{kind === 'income' ? '+ Add an income target' : '+ Budget a category'}</T>
            </Pressable>
          </View>
        ) : <Empty icon="chart-donut" title={kind === 'income' ? 'No income targets' : 'No budgets yet'}
          text={kind === 'income' ? 'Set a target like ₱100k a month and watch your progress.' : 'Pick one category first. Food usually gives the fastest win.'}
          action="Create one" onAction={() => router.push({ pathname: '/budget/[id]', params: { id: 'new', kind } })} />}
      </Spot>
      </KSheet>
    </Screen>
  );
}
