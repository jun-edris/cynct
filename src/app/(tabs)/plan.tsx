import React from 'react';
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useData, safeJson } from '../../data/DataContext';
import { radius, useTheme } from '../../theme';
import { Card, Grid, Icon, IconBubble, Screen, Section, T } from '../../components/ui';
import { compactPeso, dayLabel, todayISO } from '../../lib/money';
import { budgetStatus, debtStatus, goalProgress, upcoming } from '../../lib/ledger';

function Tile({ icon, color, title, sub, href, wide }: { icon: string; color: string; title: string; sub?: string; href: Href; wide?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => router.push(href)} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => ({ width: '100%', flexGrow: wide ? undefined : 1, backgroundColor: c.surface, borderRadius: radius.lg, padding: 16,
        flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'flex-start', gap: wide ? 14 : 12, opacity: pressed ? 0.8 : 1 })}>
      <IconBubble icon={icon} color={color} size={wide ? 46 : 42} />
      <View style={{ flex: wide ? 1 : undefined }}>
        <T v="h3">{title}</T>
        {sub ? <T v="small" numberOfLines={2}>{sub}</T> : null}
      </View>
      {wide ? <Icon name="chevron-right" color={c.faint} /> : null}
    </Pressable>
  );
}

export default function Plan() {
  const { c } = useTheme();
  const { data, baseBalances, rtx, cats, plannedBase, missing } = useData();
  const today = todayISO();
  const budgetCount = data.budgets.length;
  const over = data.budgets.filter(b => b.kind !== 'income' && budgetStatus(b, rtx, cats, today).remaining < 0).length;
  const goals = data.goals.filter(g => !g.archived);
  const saved = goals.reduce((s, g) => s + goalProgress({ ...g, annualRate: g.annualRate / 10_000, accountIds: safeJson<string[]>(g.accountIds, []) }, baseBalances, rtx, today).saved, 0);
  const open = data.debts.filter(d => !d.closed);
  const owe = open.filter(d => d.direction === 'owe').reduce((s, d) => s + debtStatus(d, rtx).remaining, 0);
  const owed = open.filter(d => d.direction === 'owed').reduce((s, d) => s + debtStatus(d, rtx).remaining, 0);
  const next = upcoming(plannedBase.recurring, plannedBase.installments.filter(i => i.paidCount < i.months), today, 60)[0];
  const activeTrip = data.trips.find(t => !t.endDate);
  const activeInst = data.installments.filter(i => i.paidCount < i.months).length;

  return (
    <Screen title="Plan" subtitle="Budgets, goals, debts and what’s coming." padBottom={130}>
      <View style={{ gap: 10, marginTop: 6 }}>
        <Tile wide icon="chart-donut" color={c.mango} title="Budgets"
          sub={budgetCount ? `${budgetCount} active${over ? ` · ${over} over limit` : ' · all within limits'}` : 'Daily to yearly limits, and income targets'} href="/budgets" />
        <Tile wide icon="flag-variant" color={c.income} title="Goals" sub={goals.length ? `${goals.length} in progress · ${compactPeso(saved)} saved` : 'Save toward something that matters'} href="/goals" />
        <Tile wide icon="calendar-clock" color={c.info} title="Planned payments"
          sub={next ? `Next: ${next.name}, ${dayLabel(next.date)}` : 'Bills, paydays and one-time payments'} href="/planned" />
      </View>

      <Section title="Debts">
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Card style={{ flex: 1, gap: 10 }} onPress={() => router.push({ pathname: '/debts', params: { dir: 'owe' } })}>
            <IconBubble icon="hand-coin-outline" color={c.spend} size={40} />
            <View><T v="h3">You owe</T><T v="numLg" color={owe ? c.spend : c.ink} style={{ fontSize: 20 }}>{compactPeso(owe)}</T></View>
          </Card>
          <Card style={{ flex: 1, gap: 10 }} onPress={() => router.push({ pathname: '/debts', params: { dir: 'owed' } })}>
            <IconBubble icon="hand-coin" color={c.income} size={40} />
            <View><T v="h3">Owed to you</T><T v="numLg" color={owed ? c.income : c.ink} style={{ fontSize: 20 }}>{compactPeso(owed)}</T></View>
          </Card>
        </View>
      </Section>

      <Section title="Tools">
        <Grid>
          <Tile icon="chart-timeline-variant" color={c.mango} title="Forecast" sub="Cash for the next 7–90 days" href="/forecast" />
          <Tile icon="view-dashboard-outline" color={c.info} title="Overview" sub="Everything in one screen" href="/overview" />
          <Tile icon="calendar-sync" color="#8B6CFF" title="Installments" sub={activeInst ? `${activeInst} active` : '0% plans, card installments'} href="/installments" />
          <Tile icon="airplane" color="#3FA7D6" title="Travel" sub={activeTrip ? `On: ${activeTrip.name}` : 'Group a trip’s spending'} href="/travel" />
          <Tile icon="tag-multiple-outline" color="#FF5C8A" title="Tags" sub={`${data.tags.length} tag${data.tags.length === 1 ? '' : 's'}`} href="/tags" />
          <Tile icon="note-text-outline" color="#C08552" title="Notes" sub={`${data.notes.length} note${data.notes.length === 1 ? '' : 's'}`} href="/notes" />
          <Tile icon="shape-outline" color="#2EC4B6" title="Categories" sub="Add, rename, nest" href="/categories" />
          <Tile icon="qrcode" color="#7C879C" title="Payment methods" sub="Your QR codes, ready to share" href="/payment-methods" />
          <Tile icon="line-scan" color="#8B6CFF" title="Scan receipt" sub="Reads the total for you" href="/scan" />
          <Tile icon="bookmark-outline" color="#FF5C8A" title="Templates" sub={data.templates.length ? `${data.templates.length} saved` : 'One-tap repeat entries'} href="/templates" />
          <Tile icon="currency-usd" color={c.income} title="Currencies" sub={missing.length ? `Set ${missing.join(', ')} rate` : 'Rates and converter'} href="/currencies" />
          <Tile icon="file-document-outline" color={c.info} title="Invoices" sub={data.invoices.filter(i => i.status !== 'paid').length ? `${data.invoices.filter(i => i.status !== 'paid').length} unpaid` : 'Bill a client, send a PDF'} href="/invoices" />
          <Tile icon="file-pdf-box" color={c.spend} title="Statement" sub="A month as a PDF" href="/statement" />
          <Tile icon="play-circle-outline" color={c.mango} title="Recap" sub="Your month, wrapped" href="/recap" />
          <Tile icon="bell-outline" color="#8B6CFF" title="Reminders" sub={(data.settings.notify as { enabled?: boolean } | undefined)?.enabled ? 'On' : 'Bills, paydays, due dates'} href="/notifications" />
        </Grid>
      </Section>

      <Section title="Calculators">
        <Grid>
          <Tile icon="bank-outline" color="#4C8DFF" title="Loan" sub="Monthly payment and true cost" href="/tools/loan" />
          <Tile icon="piggy-bank-outline" color={c.mango} title="Savings" sub="How much, how long" href="/tools/savings" />
          <Tile icon="calculator-variant-outline" color={c.spend} title="Tax" sub="PH income tax, SSS, PhilHealth, Pag-IBIG" href="/tools/tax" />
        </Grid>
        <View style={{ marginTop: 10 }}>
          <Tile icon="account-multiple-outline" color="#2EC4B6" title="Split the bill" sub="Even shares with service charge" href="/tools/split" wide />
        </View>
      </Section>
    </Screen>
  );
}
