import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useData } from '../data/DataContext';
import { useTheme } from '../theme';
import { Button, Empty, IconBubble, List, Row, Screen, Section, Segmented, StatTile, T } from '../components/ui';
import { dueStatus, monthlyEquivalent } from '../lib/ledger';
import { compactPeso, dayLabel, peso } from '../lib/money';
import { FREQ_LABEL } from '../lib/labels';

type Filter = 'all' | 'bill' | 'income';

export default function Planned() {
  const { c } = useTheme();
  const { data, catById } = useData();
  const [filter, setFilter] = useState<Filter>('all');
  const list = data.recurring.filter(r => filter === 'all' || (filter === 'income' ? r.kind === 'income' : r.kind !== 'income'))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.nextDue.localeCompare(b.nextDue));
  const active = data.recurring.filter(r => r.active);
  const monthlyOut = active.filter(r => r.kind === 'bill' && r.frequency !== 'once').reduce((s, r) => s + monthlyEquivalent(r.amount, r.frequency), 0);
  const monthlyIn = active.filter(r => r.kind === 'income' && r.frequency !== 'once').reduce((s, r) => s + monthlyEquivalent(r.amount, r.frequency), 0);
  const recurringCount = active.filter(r => r.frequency !== 'once').length;
  const onceCount = active.filter(r => r.frequency === 'once').length;
  const add = (kind: string) => router.push({ pathname: '/recurring/[id]', params: { id: 'new', kind } });

  const row = (r: (typeof list)[number]) => {
    const cat = r.categoryId ? catById.get(r.categoryId) : undefined;
    const st = r.active ? dueStatus(r.nextDue) : null;
    const color = r.kind === 'income' ? c.income : r.kind === 'transfer' ? c.info : cat?.color ?? c.spend;
    return (
      <Row key={r.id} onPress={() => router.push(`/recurring/${r.id}`)}
        left={<IconBubble icon={r.debtId ? 'hand-coin-outline' : r.kind === 'income' ? 'cash-plus' : r.kind === 'transfer' ? 'swap-horizontal' : cat?.icon ?? 'receipt'} color={r.active ? color : c.faint} />}
        title={r.name}
        sub={<T v="small" color={st === 'overdue' ? c.spend : st === 'today' ? c.warn : undefined}>
          {r.active ? `${FREQ_LABEL[r.frequency] ?? r.frequency} · ${st === 'overdue' ? 'overdue since' : 'next'} ${dayLabel(r.nextDue)}` : r.frequency === 'once' ? 'Done' : 'Paused'}
        </T>}
        right={<T v="num" color={r.kind === 'income' ? c.income : c.ink}>{r.kind === 'income' ? '+' : ''}{peso(r.amount, { cents: false })}</T>} />
    );
  };

  return (
    <Screen title="Planned payments" subtitle="Bills, paydays and one-time payments you expect." back>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StatTile label="Bills a month" value={compactPeso(monthlyOut)} color={c.spend} />
        <StatTile label="Income a month" value={compactPeso(monthlyIn)} color={c.income} />
      </View>
      <T v="small" style={{ marginTop: 8 }}>{recurringCount} recurring · {onceCount} one-time</T>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Button icon="arrow-up" label="Plan expense" onPress={() => add('bill')} style={{ flex: 1 }} />
        <Button icon="arrow-down" variant="secondary" label="Plan income" onPress={() => add('income')} style={{ flex: 1 }} />
      </View>
      <View style={{ marginTop: 16 }}>
        <Segmented value={filter} onChange={setFilter} options={[['all', 'All'], ['bill', 'Expenses'], ['income', 'Income']]} />
      </View>
      <Section title={filter === 'all' ? 'Everything planned' : filter === 'income' ? 'Income' : 'Expenses and savings'}>
        {list.length ? <List>{list.map(row)}</List>
          : <Empty icon="calendar-blank-outline" title="Nothing planned" text="Add your salary, rent, subscriptions or a one-time payment. You’ll see them in the forecast and get a tap-to-pay row on Home." />}
      </Section>
    </Screen>
  );
}
