import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useData } from '../data/DataContext';
import { useTheme } from '../theme';
import { Block, Empty, IconBubble, List, Row, Screen, Section, StatTile, T } from '../components/ui';
import { UpcomingRow } from '../components/domain';
import { debtStatus, forecast, isLiability, netWorth } from '../lib/ledger';
import { compactPeso, peso, todayISO } from '../lib/money';
import { ACCOUNT_TYPES } from '../lib/seed';

export default function Overview() {
  const { c } = useTheme();
  const { data, baseBalances: balances, balances: native, rtx, plannedBase, goalFunds, goalLinked, fmt } = useData();
  const today = todayISO();
  const nw = netWorth(data.accounts, balances, goalFunds);
  const accounts = data.accounts.filter(a => !a.archived);
  const cash = accounts.filter(a => !isLiability(a.type)).reduce((s, a) => s + (balances.get(a.id) ?? 0), 0);
  const cards = accounts.filter(a => isLiability(a.type)).reduce((s, a) => s + Math.max(0, -(balances.get(a.id) ?? 0)), 0);
  const open = data.debts.filter(d => !d.closed);
  const owe = open.filter(d => d.direction === 'owe').map(d => ({ d, s: debtStatus(d, rtx) }));
  const owed = open.filter(d => d.direction === 'owed').map(d => ({ d, s: debtStatus(d, rtx) }));
  const oweTotal = owe.reduce((s, x) => s + x.s.remaining, 0);
  const owedTotal = owed.reduce((s, x) => s + x.s.remaining, 0);
  // Net position = everything you have (incl. goals and money owed to you) minus every card, loan and debt.
  const position = nw.net + owedTotal - oweTotal;
  const f = forecast({ accounts: data.accounts, balances, txs: rtx, recurring: plannedBase.recurring,
    installments: plannedBase.installments.filter(i => i.paidCount < i.months), debts: data.debts }, today, 60);
  const nextOut = f.items.find(i => i.direction === 'out');
  const nextIn = f.items.find(i => i.direction === 'in');

  return (
    <Screen title="Overview" subtitle="Everything you have and owe, in one place." back>
      <Block tone="mango">
        <T v="semi" color={c.onMango}>Net position</T>
        <T v="display" color={c.onMango}>{peso(position, { cents: false })}</T>
        <T v="small" color={c.onMango} style={{ opacity: 0.75, marginTop: 4 }}>Accounts and goals, plus money owed to you, minus cards, loans and debts.</T>
      </Block>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <StatTile label="Cash & banks" value={compactPeso(cash)} />
        {/* Linked-account money is also in Cash & banks; Net position counts it once. */}
        <StatTile label="In goals" value={compactPeso(goalFunds + goalLinked)} color={c.income}
          sub={goalLinked ? `${compactPeso(goalLinked)} in linked accounts, also in Cash & banks` : undefined} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <StatTile label="Cards & loans" value={compactPeso(cards)} color={c.spend} />
        <StatTile label="Debts" value={compactPeso(oweTotal)} color={c.spend} sub={`${owe.length} open`} />
        <StatTile label="Owed to you" value={compactPeso(owedTotal)} color={c.income} sub={`${owed.length} open`} />
      </View>

      <Section title="Next up">
        {nextOut || nextIn ? <List>
          {nextOut ? <UpcomingRow item={nextOut} /> : null}
          {nextIn ? <UpcomingRow item={nextIn} /> : null}
        </List> : <Empty icon="calendar-blank-outline" title="Nothing planned in the next 60 days" />}
      </Section>

      <Section title="Accounts" action="Wallet" onAction={() => router.push('/wallet')}>
        {accounts.length ? <List>{accounts.map(a => {
          const b = native.get(a.id) ?? 0;
          return <Row key={a.id} left={<IconBubble icon={a.icon} color={a.color} />} title={a.name} sub={ACCOUNT_TYPES[a.type]} onPress={() => router.push(`/acct/${a.id}`)}
            right={<T v="num" color={b < 0 ? c.spend : c.ink}>{fmt(b, a.id, { cents: false })}</T>} />;
        })}</List> : <Empty title="No accounts" />}
      </Section>

      {owe.length ? <Section title="You owe" action="All" onAction={() => router.push({ pathname: '/debts', params: { dir: 'owe' } })}>
        <List>{owe.map(({ d, s }) => <Row key={d.id} icon="hand-coin-outline" iconColor={c.spend} title={d.person} onPress={() => router.push(`/debt/${d.id}`)}
          right={<T v="num">{peso(s.remaining, { cents: false })}</T>} />)}</List>
      </Section> : null}
      {owed.length ? <Section title="Owed to you" action="All" onAction={() => router.push({ pathname: '/debts', params: { dir: 'owed' } })}>
        <List>{owed.map(({ d, s }) => <Row key={d.id} icon="account-cash-outline" iconColor={c.income} title={d.person} onPress={() => router.push(`/debt/${d.id}`)}
          right={<T v="num">{peso(s.remaining, { cents: false })}</T>} />)}</List>
      </Section> : null}
    </Screen>
  );
}
