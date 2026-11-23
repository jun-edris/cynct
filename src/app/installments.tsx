import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useData } from '../data/DataContext';
import { useTheme } from '../theme';
import { Bar, Block, Button, Empty, IconBubble, List, Row, Screen, Section, T } from '../components/ui';
import { installmentStatus } from '../lib/ledger';
import { dayLabel, peso } from '../lib/money';

export default function Installments() {
  const { c } = useTheme();
  const { data, accById, fmt } = useData();
  const rows = data.installments.map(i => ({ i, s: installmentStatus(i) }));
  const active = rows.filter(x => !x.s.done);
  const done = rows.filter(x => x.s.done);
  const monthly = active.reduce((s, x) => s + x.i.monthlyAmount, 0);
  const remaining = active.reduce((s, x) => s + x.s.remaining, 0);

  const item = ({ i, s }: (typeof rows)[number]) => (
    <Row key={i.id} onPress={() => router.push(`/installment/${i.id}`)} left={<IconBubble icon="calendar-sync" color={s.done ? c.faint : '#8B6CFF'} />}
      title={i.name}
      sub={<View style={{ gap: 6, marginTop: 4 }}>
        <T v="small">{s.done ? `Paid ${i.months} of ${i.months}` : `${i.paidCount}/${i.months} paid · next ${dayLabel(i.nextDue)} · ${accById.get(i.accountId)?.name ?? ''}`}</T>
        {!s.done ? <Bar pct={s.pct} color="#8B6CFF" /> : null}
      </View>}
      right={<View style={{ alignItems: 'flex-end' }}><T v="num">{fmt(i.monthlyAmount, i.accountId, { cents: false })}</T><T v="small">a month</T></View>} />
  );

  return (
    <Screen title="Installments" subtitle="0% plans, card installments and anything paid in fixed months." back
      right={<Button small icon="plus" label="Add" onPress={() => router.push('/installment/new')} />}>
      <Block tone="navy">
        <T v="semi" color={c.navyMuted}>Still to pay</T>
        <T v="display" color={c.navyText}>{peso(remaining, { cents: false })}</T>
        <T v="small" color={c.navyMuted} style={{ marginTop: 6 }}>{peso(monthly, { cents: false })} a month across {active.length} plan{active.length === 1 ? '' : 's'}</T>
      </Block>
      <Section title="Active">
        {active.length ? <List>{active.map(item)}</List>
          : <Empty icon="calendar-sync" title="No installments" text="Add a phone, laptop or appliance you’re paying monthly. Each payment shows in Coming up." action="Add one" onAction={() => router.push('/installment/new')} />}
      </Section>
      {done.length ? <Section title="Finished"><List>{done.map(item)}</List></Section> : null}
    </Screen>
  );
}
