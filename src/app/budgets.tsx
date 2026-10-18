import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useData } from '../data/DataContext';
import { useTheme } from '../theme';
import { Bar, Button, Card, Empty, IconBubble, List, Ring, Row, Screen, Segmented, T } from '../components/ui';
import { budgetStatus } from '../lib/ledger';
import { peso, todayISO } from '../lib/money';
import { PERIOD_WORD } from '../lib/labels';


export default function Budgets() {
  const { c } = useTheme();
  const { data, cats, catById } = useData();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const today = todayISO();
  const list = data.budgets.filter(b => (b.kind ?? 'expense') === kind).map(b => ({ b, s: budgetStatus(b, data.transactions, cats, today) }));
  const used = list.reduce((s, x) => s + x.s.spent, 0);
  const avail = list.reduce((s, x) => s + x.s.available, 0);

  return (
    <Screen title="Budgets" back right={<Button small icon="plus" label="New" onPress={() => router.push({ pathname: '/budget/[id]', params: { id: 'new', kind } })} />}>
      <Segmented value={kind} onChange={setKind} options={[['expense', 'Spending limits', 'arrow-up'], ['income', 'Income targets', 'arrow-down']]} />
      {list.length ? (
        <Card style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <Ring pct={avail ? used / avail : 0} size={96} stroke={11} color={kind === 'income' ? c.income : used > avail ? c.spend : c.mango}>
            <T v="num" style={{ fontSize: 18 }}>{avail ? Math.round((used / avail) * 100) : 0}%</T>
          </Ring>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="label">{kind === 'income' ? 'Earned toward targets' : 'Used across budgets'}</T>
            <T v="numLg">{peso(used, { cents: false })}</T>
            <T v="small">of {peso(avail, { cents: false })} for each budget’s current period</T>
          </View>
        </Card>
      ) : null}
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
    </Screen>
  );
}
