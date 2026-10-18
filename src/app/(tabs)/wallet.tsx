import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useData } from '../../data/DataContext';
import { radius, useTheme } from '../../theme';
import { Bar, Button, Card, Empty, Icon, IconBubble, IconButton, List, Row, Screen, Section, Segmented, T } from '../../components/ui';
import { compactPeso, peso } from '../../lib/money';
import { isLiability, netWorth } from '../../lib/ledger';
import { ACCOUNT_TYPES } from '../../lib/seed';
import type { Account } from '../../db/schema';

const NAVY = '#0B1426';

function AccountCard({ a, balance }: { a: Account; balance: number }) {
  const liab = isLiability(a.type);
  const owed = liab ? Math.max(0, -balance) : 0;
  return (
    <Pressable onPress={() => router.push(`/account/${a.id}`)} accessibilityRole="button" accessibilityLabel={`${a.name}, ${liab ? `owe ${peso(owed)}` : peso(balance)}`}
      style={({ pressed }) => ({ width: '48.5%', aspectRatio: 1.05, backgroundColor: a.color, borderRadius: radius.lg, padding: 14, justifyContent: 'space-between', opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: 'rgba(11,20,38,0.12)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={a.icon} size={21} color={NAVY} />
        </View>
        <T v="label" color={NAVY} style={{ opacity: 0.7 }}>{ACCOUNT_TYPES[a.type]}</T>
      </View>
      <View style={{ gap: 2 }}>
        <T v="semi" color={NAVY} numberOfLines={1}>{a.name}</T>
        <T v="numLg" color={NAVY} numberOfLines={1} style={{ fontSize: 21 }}>{liab ? peso(owed) : peso(balance)}</T>
        {liab ? (a.creditLimit ? <View style={{ marginTop: 6 }}><Bar pct={owed / a.creditLimit} color={NAVY} track="rgba(11,20,38,0.15)" height={6} /></View>
          : <T v="label" color={NAVY} style={{ opacity: 0.7 }}>owed</T>) : null}
      </View>
    </Pressable>
  );
}

export default function Wallet() {
  const { c } = useTheme();
  const { data, balances, goalFunds } = useData();
  const [view, setView] = useState<'cards' | 'list'>('cards');
  const nw = netWorth(data.accounts, balances, goalFunds);
  const active = data.accounts.filter(a => !a.archived);
  const archived = data.accounts.filter(a => a.archived);
  const assets = active.filter(a => !isLiability(a.type));
  const liabilities = active.filter(a => isLiability(a.type));

  return (
    <Screen title="Wallet" right={<>
      <IconButton name="qrcode" label="My payment methods" onPress={() => router.push('/payment-methods')} filled />
      <IconButton name="plus" label="Add account" onPress={() => router.push('/account/new')} filled />
    </>} padBottom={130}>
      <Card style={{ flexDirection: 'row', gap: 0, padding: 0 }}>
        {[['Net worth', nw.net, c.ink], ['You have', nw.assets, c.income], ['You owe', -nw.liabilities, nw.liabilities ? c.spend : c.ink]].map(([l, v, col], i) => (
          <View key={String(l)} style={{ flex: 1, padding: 14, borderLeftWidth: i ? 1 : 0, borderColor: c.line }}>
            <T v="label">{String(l)}</T>
            <T v="num" color={String(col)} style={{ fontSize: 18, marginTop: 4 }} numberOfLines={1}>{compactPeso(Number(v))}</T>
          </View>
        ))}
      </Card>
      {goalFunds > 0 ? <T v="small" style={{ marginTop: 8 }}>Includes {peso(goalFunds, { cents: false })} set aside inside goals.</T> : null}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Card style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }} onPress={() => router.push('/overview')}>
          <IconBubble icon="view-dashboard-outline" color={c.info} size={36} /><T v="semi">Overview</T>
        </Card>
        <Card style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }} onPress={() => router.push('/forecast')}>
          <IconBubble icon="chart-timeline-variant" color={c.mango} size={36} /><T v="semi">Forecast</T>
        </Card>
      </View>

      <View style={{ marginTop: 18 }}>
        <Segmented value={view} onChange={setView} options={[['cards', 'Cards', 'view-grid-outline'], ['list', 'List', 'format-list-bulleted']]} />
      </View>

      {!active.length ? <View style={{ marginTop: 16 }}><Empty icon="wallet-plus-outline" title="Add your first account" text="Banks, e-wallets, cash, credit cards and loans." action="Add account" onAction={() => router.push('/account/new')} /></View> : null}

      {[['Money', assets], ['Cards and loans', liabilities]].map(([title, list]) => {
        const accs = list as Account[];
        if (!accs.length) return null;
        const total = accs.reduce((s, a) => s + (balances.get(a.id) ?? 0), 0);
        const liab = title !== 'Money';
        return (
          <Section key={String(title)} title={String(title)} aside={liab ? `${peso(Math.max(0, -total), { cents: false })} owed` : peso(total, { cents: false })}>
            {view === 'cards' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {accs.map(a => <AccountCard key={a.id} a={a} balance={balances.get(a.id) ?? 0} />)}
              </View>
            ) : (
              <List>
                {accs.map(a => {
                  const b = balances.get(a.id) ?? 0;
                  return <Row key={a.id} icon={a.icon} iconColor={a.color} title={a.name} sub={ACCOUNT_TYPES[a.type]} chevron onPress={() => router.push(`/account/${a.id}`)}
                    right={<T v="num" color={liab ? (b < 0 ? c.spend : c.ink) : b < 0 ? c.spend : c.ink}>{liab ? peso(Math.max(0, -b)) : peso(b)}</T>} />;
                })}
              </List>
            )}
          </Section>
        );
      })}

      <T v="small" style={{ marginTop: 14 }}>Banks and e-wallets don’t sync automatically. Open an account and enter its real balance now and then; the difference is saved as a correction.</T>

      {archived.length ? (
        <Section title="Archived">
          <List>{archived.map(a => <Row key={a.id} icon={a.icon} iconColor={c.faint} title={a.name} chevron onPress={() => router.push(`/account/${a.id}`)}
            right={<T v="num" color={c.muted}>{peso(balances.get(a.id) ?? 0)}</T>} />)}</List>
        </Section>
      ) : null}
      {active.length ? <Button variant="secondary" icon="plus" label="Add account" style={{ marginTop: 18 }} onPress={() => router.push('/account/new')} /> : null}
    </Screen>
  );
}
