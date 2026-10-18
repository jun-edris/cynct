import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useData } from '../data/DataContext';
import { useTheme } from '../theme';
import { Button, Icon, IconBubble, List, Row, Screen, Segmented, T } from '../components/ui';
import { summarize } from '../lib/ledger';
import { addMonths, peso, todayISO } from '../lib/money';

export default function Categories() {
  const { c } = useTheme();
  const { data, cats } = useData();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const today = todayISO();
  const last90 = summarize(data.transactions, addMonths(today, -3), today, cats);
  const roots = data.categories.filter(x => x.kind === kind && !x.parentId);
  const budgetFor = (id: string) => data.budgets.find(b => b.categoryId === id);

  return (
    <Screen title="Categories" subtitle="Totals cover the last 3 months. Subcategories roll up into their parent." back>
      <Segmented value={kind} onChange={setKind} options={[['expense', 'Spending', 'arrow-up'], ['income', 'Income', 'arrow-down']]} />
      <View style={{ gap: 12, marginTop: 16 }}>
        {roots.map(r => {
          const children = data.categories.filter(x => x.parentId === r.id);
          const total = (kind === 'expense' ? last90.byRoot : last90.incomeByRoot).get(r.id) ?? 0;
          const b = budgetFor(r.id);
          return (
            <List key={r.id}>
              <Row left={<IconBubble icon={r.icon} color={r.archived ? c.faint : r.color} />} title={r.archived ? `${r.name} (hidden)` : r.name}
                sub={b ? `Budget ${peso(b.amount, { cents: false })} ${b.period}` : children.length ? `${children.length} subcategories` : 'No budget'}
                right={<T v="num" color={c.muted}>{peso(total, { cents: false })}</T>} onPress={() => router.push(`/category/${r.id}`)} chevron />
              {children.map(ch => (
                <Row key={ch.id} left={<View style={{ width: 40, alignItems: 'center' }}><Icon name={ch.icon} size={18} color={ch.archived ? c.faint : ch.color} /></View>}
                  title={ch.archived ? `${ch.name} (hidden)` : ch.name} onPress={() => router.push(`/category/${ch.id}`)} chevron
                  right={kind === 'expense' ? <T v="num" color={c.muted}>{peso(last90.byCategory.get(ch.id) ?? 0, { cents: false })}</T> : undefined} />
              ))}
            </List>
          );
        })}
        <Button icon="plus" label="Create category" onPress={() => router.push({ pathname: '/category/[id]', params: { id: 'new', kind } })} />
      </View>
    </Screen>
  );
}
