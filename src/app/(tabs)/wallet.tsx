import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useData } from '../../data/DataContext';
import { radius, useTheme } from '../../theme';
import { Bar, Button, Card, Empty, Grid, Icon, IconBubble, List, Note, Row, Screen, Section, Segmented, T } from '../../components/ui';
import { BASE, money } from '../../lib/currency';
import { GlassIcon, KHeader, KSheet, OnNight } from '../../components/k';
import { setSetting } from '../../db/repo';
import { compactPeso, peso } from '../../lib/money';
import { isLiability, netWorth } from '../../lib/ledger';
import { ACCOUNT_TYPES } from '../../lib/seed';
import type { Account } from '../../db/schema';

const NAVY = '#0B1426';

function AccountCard({ a, balance, base }: { a: Account; balance: number; base: number }) {
  const liab = isLiability(a.type);
  const owed = liab ? Math.max(0, -balance) : 0;
  const m = (v: number) => money(v, a.currency);
  return (
    <Pressable onPress={() => router.push(`/account/${a.id}`)} accessibilityRole="button" accessibilityLabel={`${a.name}, ${liab ? `owe ${m(owed)}` : m(balance)}`}
      style={({ pressed }) => ({ width: '100%', aspectRatio: 1.05, backgroundColor: a.color, borderRadius: radius.lg, padding: 14, justifyContent: 'space-between', opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: 'rgba(11,20,38,0.12)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={a.icon} size={21} color={NAVY} />
        </View>
        <T v="label" color={NAVY} style={{ opacity: 0.7 }}>{a.currency !== BASE ? a.currency : ACCOUNT_TYPES[a.type]}</T>
      </View>
      <View style={{ gap: 2 }}>
        <T v="semi" color={NAVY} numberOfLines={1}>{a.name}</T>
        <T v="numLg" color={NAVY} numberOfLines={1} style={{ fontSize: 21 }}>{liab ? m(owed) : m(balance)}</T>
        {a.currency !== BASE ? <T v="label" color={NAVY} style={{ opacity: 0.7 }}>≈ {peso(liab ? Math.max(0, -base) : base, { cents: false })}</T> : null}
        {liab ? (a.creditLimit ? <View style={{ marginTop: 6 }}><Bar pct={owed / a.creditLimit} color={NAVY} track="rgba(11,20,38,0.15)" height={6} /></View>
          : <T v="label" color={NAVY} style={{ opacity: 0.7 }}>owed</T>) : null}
      </View>
    </Pressable>
  );
}

export default function Wallet() {
  const { c } = useTheme();
  const { data, act, balances, baseBalances, goalFunds, missing } = useData();
  const hidden = data.settings.hideAmounts === true;
  const [view, setView] = useState<'cards' | 'list'>('cards');
  const nw = netWorth(data.accounts, baseBalances, goalFunds);
  const active = data.accounts.filter(a => !a.archived);
  const archived = data.accounts.filter(a => a.archived);
  const assets = active.filter(a => !isLiability(a.type));
  const liabilities = active.filter(a => isLiability(a.type));

  return (
    <Screen headerless edge padBottom={130}>
      <KHeader title="Wallet" right={<>
        <GlassIcon name={hidden ? 'eye-off-outline' : 'eye-outline'} label={hidden ? 'Show amounts' : 'Hide amounts'} onPress={() => act(db => setSetting(db, 'hideAmounts', !hidden))} />
        <GlassIcon name="qrcode" label="My payment methods" onPress={() => router.push('/payment-methods')} />
        <GlassIcon name="plus" label="Add account" onPress={() => router.push('/account/new')} />
      </>}>
        <View style={{ marginTop: 12 }}>
          <OnNight>Net worth</OnNight>
          <T v="display" color="#FFFFFF" style={{ fontSize: 46, lineHeight: 54 }} numberOfLines={1}>{peso(nw.net, { cents: false })}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, marginTop: 4 }}>
            <OnNight v="xs">{`You have ${compactPeso(nw.assets)}`}</OnNight>
            <OnNight v="xs">{`You owe ${compactPeso(nw.liabilities)}`}</OnNight>
            {goalFunds > 0 ? <OnNight v="xs">{`In goals ${compactPeso(goalFunds)}`}</OnNight> : null}
          </View>
        </View>
      </KHeader>
      <KSheet>
      {missing.length ? <View style={{ marginTop: 10 }}><Note tone="warn" icon="currency-usd-off">{`Set a rate for ${missing.join(', ')} in Currencies. Until then those accounts count as ₱0 in totals.`}</Note></View> : null}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Card style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }} onPress={() => router.push('/overview')}>
          <IconBubble icon="view-dashboard-outline" color={c.info} size={36} /><T v="semi">Overview</T>
        </Card>
        <Card style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }} onPress={() => router.push('/forecast')}>
          <IconBubble icon="chart-timeline-variant" color={c.mango} size={36} /><T v="semi">Forecast</T>
        </Card>
      </View>
      <Card style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }} onPress={() => router.push('/currencies')}>
        <IconBubble icon="currency-usd" color={c.income} size={36} />
        <View style={{ flex: 1 }}><T v="semi">Currencies</T><T v="small">Rates for accounts in other currencies, and a converter</T></View>
        <Icon name="chevron-right" color={c.faint} />
      </Card>

      <View style={{ marginTop: 18 }}>
        <Segmented value={view} onChange={setView} options={[['cards', 'Cards', 'view-grid-outline'], ['list', 'List', 'format-list-bulleted']]} />
      </View>

      {!active.length ? <View style={{ marginTop: 16 }}><Empty icon="wallet-plus-outline" title="Add your first account" text="Banks, e-wallets, cash, credit cards and loans." action="Add account" onAction={() => router.push('/account/new')} /></View> : null}

      {[['Money', assets], ['Cards and loans', liabilities]].map(([title, list]) => {
        const accs = list as Account[];
        if (!accs.length) return null;
        const total = accs.reduce((s, a) => s + (baseBalances.get(a.id) ?? 0), 0);
        const liab = title !== 'Money';
        return (
          <Section key={String(title)} title={String(title)} aside={liab ? `${peso(Math.max(0, -total), { cents: false })} owed` : peso(total, { cents: false })}>
            {view === 'cards' ? (
              <Grid>
                {accs.map(a => <AccountCard key={a.id} a={a} balance={balances.get(a.id) ?? 0} base={baseBalances.get(a.id) ?? 0} />)}
              </Grid>
            ) : (
              <List>
                {accs.map(a => {
                  const b = balances.get(a.id) ?? 0;
                  return <Row key={a.id} icon={a.icon} iconColor={a.color} title={a.name} sub={ACCOUNT_TYPES[a.type]} chevron onPress={() => router.push(`/account/${a.id}`)}
                    right={<T v="num" color={liab ? (b < 0 ? c.spend : c.ink) : b < 0 ? c.spend : c.ink}>{liab ? money(Math.max(0, -b), a.currency) : money(b, a.currency)}</T>} />;
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
            right={<T v="num" color={c.muted}>{money(balances.get(a.id) ?? 0, a.currency)}</T>} />)}</List>
        </Section>
      ) : null}
      {active.length ? <Button variant="secondary" icon="plus" label="Add account" style={{ marginTop: 18 }} onPress={() => router.push('/account/new')} /> : null}
      </KSheet>
    </Screen>
  );
}
