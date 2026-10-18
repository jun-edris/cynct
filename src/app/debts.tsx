import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useData } from '../data/DataContext';
import { useTheme } from '../theme';
import { Bar, Block, Button, Empty, IconBubble, List, Row, Screen, Section, Segmented, T } from '../components/ui';
import { debtStatus, dueStatus } from '../lib/ledger';
import { dayLabel, peso } from '../lib/money';
import { PARTY_ICON } from '../lib/labels';

type Dir = 'owe' | 'owed';

export default function Debts() {
  const params = useLocalSearchParams<{ dir?: string }>();
  const { c } = useTheme();
  const { data, rtx } = useData();
  const [dir, setDir] = useState<Dir>(params.dir === 'owed' ? 'owed' : 'owe');
  const rows = data.debts.filter(d => d.direction === dir).map(d => ({ d, s: debtStatus(d, rtx) }));
  const open = rows.filter(x => !x.d.closed);
  const closed = rows.filter(x => x.d.closed);
  const remaining = open.reduce((s, x) => s + x.s.remaining, 0);
  const total = open.reduce((s, x) => s + x.s.total, 0);
  const tone = dir === 'owe' ? c.spend : c.income;

  const item = ({ d, s }: (typeof rows)[number]) => {
    const due = d.dueDate && !d.closed ? dueStatus(d.dueDate) : null;
    return (
      <Row key={d.id} onPress={() => router.push(`/debt/${d.id}`)} left={<IconBubble icon={PARTY_ICON[d.partyType] ?? 'account'} color={d.closed ? c.muted : tone} />}
        title={d.person}
        sub={<View style={{ gap: 6, marginTop: 4 }}>
          <T v="small" color={due === 'overdue' ? c.spend : due === 'today' || due === 'soon' ? c.warn : undefined}>{d.closed ? 'Settled' : due ? `${due === 'overdue' ? 'Overdue since' : 'Due'} ${dayLabel(d.dueDate!)} · ${peso(s.remaining, { cents: false })} left` : `${peso(s.paid)} of ${peso(s.total)} ${dir === 'owe' ? 'paid' : 'collected'}`}</T>
          {!d.closed ? <Bar pct={s.pct} color={tone} /> : null}
        </View>}
        right={<T v="num" color={d.closed ? c.muted : c.ink}>{peso(d.closed ? s.total : s.remaining, { cents: false })}</T>} />
    );
  };

  return (
    <Screen title={dir === 'owe' ? 'What I owe' : 'Owed to me'} back
      right={<Button small icon="plus" label="Add" onPress={() => router.push({ pathname: '/debt-edit/[id]', params: { id: 'new', dir } })} />}>
      <Segmented value={dir} onChange={setDir} options={[['owe', 'I owe', 'arrow-up'], ['owed', 'Owed to me', 'arrow-down']]} />
      <Block tone="navy" style={{ marginTop: 16 }}>
        <T v="semi" color={c.navyMuted}>{dir === 'owe' ? 'Left to pay' : 'Left to collect'}</T>
        <T v="display" color={c.navyText}>{peso(remaining, { cents: false })}</T>
        <View style={{ marginTop: 12 }}><Bar pct={total ? 1 - remaining / total : 0} color={tone} track={c.navyLine} /></View>
        <T v="small" color={c.navyMuted} style={{ marginTop: 8 }}>{open.length} open · {closed.length} settled</T>
      </Block>
      <Section title="Open">
        {open.length ? <List>{open.map(item)}</List>
          : <Empty icon={dir === 'owe' ? 'hand-coin-outline' : 'account-cash-outline'} title={dir === 'owe' ? 'Nothing owed' : 'No one owes you'}
            text={dir === 'owe' ? 'Track loans from people, banks or lending apps.' : 'Track money you lent so it doesn’t get forgotten.'}
            action="Add one" onAction={() => router.push({ pathname: '/debt-edit/[id]', params: { id: 'new', dir } })} />}
      </Section>
      {closed.length ? <Section title="Settled"><List>{closed.map(item)}</List></Section> : null}
    </Screen>
  );
}
