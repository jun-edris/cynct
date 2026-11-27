import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useData } from '../data/DataContext';
import { useTheme } from '../theme';
import { GlassIcon, KHeader, KSheet, OnNight } from '../components/k';
import { Bar, Empty, IconBubble, List, Row, Screen, Segmented, T } from '../components/ui';
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
    <Screen headerless edge>
      <KHeader title="Budgets" back right={<GlassIcon name="plus" label="New budget" onPress={() => router.push({ pathname: '/budget/[id]', params: { id: 'new', kind } })} />}>
        <OnNight style={{ marginTop: 12 }}>{kind === 'income' ? 'Earned toward targets' : 'Used across budgets'}</OnNight>
        <T v="display" color="#FFFFFF" style={{ fontSize: 46, lineHeight: 54 }}>{peso(used, { cents: false })}</T>
        <OnNight v="xs">{avail ? `of ${peso(avail, { cents: false })} · ${Math.round((used / avail) * 100)}% for each budget’s current period` : 'No budgets here yet'}</OnNight>
      </KHeader>
      <KSheet>
      <Segmented value={kind} onChange={setKind} options={[['expense', 'Spending limits', 'arrow-up'], ['income', 'Income targets', 'arrow-down']]} />
      <View style={{ marginTop: 16 }}>
        {list.length ? (
          <List>
            {list.map(({ b, s }) => {
              const cat = b.categoryId ? catById.get(b.categoryId) : undefined;
              const good = kind === 'income' ? s.remaining <= 0 : s.remaining >= 0;
              return (
                <Row key={b.id} onPress={() => router.push(`/budget/${b.id}`)} left={<IconBubble icon={cat?.icon ?? (kind === 'income' ? 'cash-plus' : 'wallet-outline')} color={cat?.color ?? c.mango} />}
                  title={b.name}
                  sub={<View style={{ gap: 6, marginTop: 4 }}>
                    <T v="small">{peso(s.spent)} of {peso(s.available)} {PERIOD_WORD[b.period]}{s.carry ? ` · ${peso(s.carry, { sign: true })} carried` : ''}</T>
                    <Bar pct={s.pct} over={kind === 'expense' && s.remaining < 0} color={kind === 'income' ? c.income : cat?.color} />
                  </View>}
                  right={<View style={{ alignItems: 'flex-end' }}>
                    <T v="num" color={good ? c.ink : c.spend}>{peso(Math.abs(s.remaining), { cents: false })}</T>
                    <T v="small">{kind === 'income' ? (s.remaining <= 0 ? 'reached' : 'to go') : s.remaining < 0 ? 'over' : `left · ${s.daysLeft}d`}</T>
                  </View>} />
              );
            })}
          </List>
        ) : <Empty icon="chart-donut" title={kind === 'income' ? 'No income targets' : 'No budgets yet'}
          text={kind === 'income' ? 'Set a target like ₱100k a month and watch your progress.' : 'Pick one category first. Food usually gives the fastest win.'}
          action="Create one" onAction={() => router.push({ pathname: '/budget/[id]', params: { id: 'new', kind } })} />}
      </View>
      </KSheet>
    </Screen>
  );
}
