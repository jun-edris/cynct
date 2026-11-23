import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useData, safeJson } from '../data/DataContext';
import { radius, useTheme } from '../theme';
import { Block, Card, Chip, DateField, Field, Icon, List, Note, Row, Screen, Section, T } from '../components/ui';
import { forecast, goalProgress, upcoming } from '../lib/ledger';
import { setSetting } from '../db/repo';
import { dailySpending, goalShare, nextPayday, payDays, planPaycheck, type PlanBill } from '../lib/paycheck';
import { addDays, dayLabel, lastDayOfMonth, peso, toCentavos, todayISO } from '../lib/money';

const INVEST = [0, 5, 10, 15, 20];
const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function PaycheckPlan() {
  const params = useLocalSearchParams<{ amount?: string; date?: string }>();
  const { c } = useTheme();
  const { data, baseBalances, rtx, plannedBase, cats, act } = useData();
  const today = todayISO();
  const payDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const [amount, setAmount] = useState(params.amount ?? '');
  const [choice, setChoice] = useState<'auto' | '15' | 'eom' | 'custom'>('auto');
  const [custom, setCustom] = useState<string | null>(null);
  const [dayOverride, setDayOverride] = useState('');
  const [investPct, setInvestPct] = useState(Number(data.settings.paycheckInvestPct ?? 10));

  const salaryIds = useMemo(() => new Set(cats.filter(x => x.kind === 'income' && (x.id === 'salary' || x.parentId === 'salary')).map(x => x.id)), [cats]);
  const detected = useMemo(() => {
    const ins = upcoming(plannedBase.recurring, [], payDate, 70).filter(i => i.direction === 'in')
      .map(i => ({ date: i.date, categoryId: data.recurring.find(r => r.id === i.id)?.categoryId ?? null }));
    return nextPayday(ins, payDate, salaryIds);
  }, [plannedBase, payDate, data.recurring, salaryIds]);

  const eom = lastDayOfMonth(payDate) > payDate ? lastDayOfMonth(payDate) : lastDayOfMonth(addDays(payDate, 1));
  const next = choice === 'auto' ? detected ?? addDays(payDate, 15) : choice === '15' ? addDays(payDate, 15) : choice === 'eom' ? eom : custom ?? addDays(payDate, 15);
  const days = payDays(payDate, next);

  const bills: PlanBill[] = useMemo(() => forecast({
    accounts: data.accounts, balances: baseBalances, txs: rtx, recurring: plannedBase.recurring,
    installments: plannedBase.installments.filter(i => i.paidCount < i.months), debts: data.debts,
  }, payDate, days).items.filter(i => i.direction === 'out' && i.date < next)
    .map(i => ({ key: i.key, name: i.name, date: i.date, amount: i.amount, source: i.source })), [data, baseBalances, rtx, plannedBase, payDate, days, next]);

  const estDaily = useMemo(() => dailySpending(rtx, today, 60), [rtx, today]);
  const dailySpend = dayOverride ? Math.round((toCentavos(dayOverride) || 0) / days) : estDaily;

  const goals = useMemo(() => data.goals.filter(g => !g.archived).map(g => {
    const p = goalProgress({ ...g, annualRate: g.annualRate / 10_000, accountIds: safeJson<string[]>(g.accountIds, []) }, baseBalances, rtx, today);
    return { id: g.id, name: g.name, need: goalShare(g.monthly, p.needed, p.left, days) };
  }).filter(g => g.need > 0), [data.goals, baseBalances, rtx, today, days]);

  const pay = toCentavos(amount || '0') || 0;
  const plan = planPaycheck({ amount: pay, days, bills, dailySpend, goals, investPct });
  const parts = [
    { key: 'needs', label: 'Bills due before next pay', value: plan.needs, color: c.spend, icon: 'calendar-alert' },
    { key: 'day', label: 'Day-to-day', value: plan.dayToDay, color: c.warn, icon: 'cart-outline' },
    { key: 'save', label: 'Goals', value: plan.save, color: c.mango, icon: 'flag-variant' },
    { key: 'invest', label: 'Invest', value: plan.invest, color: c.info, icon: 'chart-line' },
    { key: 'free', label: 'Free to spend', value: plan.free, color: c.income, icon: 'party-popper' },
  ];
  const saving = plan.share(plan.save + plan.invest);

  return (
    <Screen title="Paycheck plan" subtitle="Split one pay into what’s spoken for, what to save, and what’s free." back>
      <Field label="This pay" big value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" prefix="₱"
        hint="Take-home amount, after tax and contributions." />

      <Section title="Lasts until">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label={detected ? `Next salary · ${dayLabel(detected)}` : 'In 15 days'} selected={choice === 'auto'} onPress={() => setChoice('auto')} icon="briefcase-outline" />
          {detected ? <Chip label="In 15 days" selected={choice === '15'} onPress={() => setChoice('15')} /> : null}
          {eom !== detected ? <Chip label={`End of month · ${dayLabel(eom)}`} selected={choice === 'eom'} onPress={() => setChoice('eom')} /> : null}
        </View>
        <View style={{ marginTop: 10 }}>
          <DateField label="Or pick the next payday" value={choice === 'custom' ? custom : null} onChange={(v) => { if (v && v > payDate) { setCustom(v); setChoice('custom'); } }} />
        </View>
        {!detected ? <T v="small" style={{ marginTop: 8 }}>Add your salary under Planned payments and Cynct will find the next payday by itself.</T> : null}
      </Section>

      {pay > 0 ? (
        <>
          <Block tone="navy" style={{ marginTop: 22, gap: 14 }}>
            <View>
              <T v="semi" color={c.navyMuted}>{`${days} days, until ${dayLabel(next)}`}</T>
              <T v="display" color={c.navyText}>{peso(plan.free, { cents: false })}</T>
              <T v="medium" color={c.navyMuted}>{plan.free > 0 ? `free to spend, about ${peso(Math.floor(plan.free / days), { cents: false })} a day on top of day-to-day` : 'nothing left over after the plan'}</T>
            </View>
            <View style={{ flexDirection: 'row', height: 18, borderRadius: 9, overflow: 'hidden', backgroundColor: c.navyLine, gap: 2 }} accessibilityLabel="How this pay is split">
              {parts.filter(p => p.value > 0).map(p => <View key={p.key} style={{ flex: p.value, backgroundColor: p.color }} />)}
            </View>
            <View style={{ gap: 8 }}>
              {parts.map(p => (
                <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: p.color }} />
                  <T v="medium" color={c.navyText} style={{ flex: 1 }}>{p.label}</T>
                  <T v="semi" color={c.navyMuted} style={{ width: 44, textAlign: 'right' }}>{pct(plan.share(p.value))}</T>
                  <T v="num" color={c.navyText} style={{ minWidth: 96, textAlign: 'right' }}>{peso(p.value, { cents: false })}</T>
                </View>
              ))}
            </View>
          </Block>

          {plan.shortfall > 0 ? (
            <View style={{ marginTop: 12 }}>
              <Note tone="warn" icon="alert-outline">{`This pay is ${peso(plan.shortfall, { cents: false })} short of bills plus day-to-day. Goals and investing are paused in this plan. Move a bill, or lower day-to-day below.`}</Note>
            </View>
          ) : plan.save < plan.wanted.save || plan.invest < plan.wanted.invest ? (
            <View style={{ marginTop: 12 }}>
              <Note tone="warn" icon="information-outline">{[
                plan.save < plan.wanted.save ? `Goals get ${peso(plan.save, { cents: false })} of the ${peso(plan.wanted.save, { cents: false })} they’d like` : null,
                plan.invest < plan.wanted.invest ? `investing gets ${peso(plan.invest, { cents: false })} of ${peso(plan.wanted.invest, { cents: false })}` : null,
              ].filter(Boolean).join(', and ').replace(/^g/, 'G').replace(/^i/, 'I') + '. That’s what fits after bills and day-to-day.'}</Note>
            </View>
          ) : (
            <View style={{ marginTop: 12 }}>
              <Note tone={saving >= 0.2 ? 'good' : 'info'} icon="scale-balance">{`Saving and investing ${pct(saving)} of this pay. A common guide is 20% or more.`}</Note>
            </View>
          )}

          <Section title="Bills due before next pay" aside={peso(plan.needs, { cents: false })}>
            {bills.length ? (
              <List>{bills.map(b => (
                <Row key={b.key} icon={b.source === 'card' ? 'credit-card-clock-outline' : b.source === 'debt' ? 'hand-coin-outline' : b.source === 'installment' ? 'calendar-sync' : 'calendar-alert'}
                  iconColor={c.spend} title={b.name} sub={b.date < payDate ? `Overdue · ${dayLabel(b.date)}` : dayLabel(b.date)} right={<T v="num">{peso(b.amount)}</T>} />
              ))}</List>
            ) : (
              <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }} onPress={() => router.push('/planned')}>
                <Icon name="calendar-plus" color={c.muted} />
                <T v="medium" style={{ flex: 1 }}>No bills planned in this window. Add rent, utilities and other regular payments under Planned payments.</T>
              </Card>
            )}
          </Section>

          <Section title="Day-to-day">
            <Field label={`Food, transport and errands for ${days} days`} value={dayOverride} onChangeText={setDayOverride} keyboardType="decimal-pad" prefix="₱"
              placeholder={String(Math.round(estDaily * days / 100))}
              hint={estDaily ? `Cynct’s estimate: about ${peso(estDaily, { cents: false })} a day, from your last 60 days. Type your own to change it.` : 'Not enough history yet. Type what you expect to spend.'} />
          </Section>

          <Section title="Goals" aside={plan.wanted.save ? peso(plan.save, { cents: false }) : undefined}>
            {plan.goals.length ? (
              <List>{plan.goals.map(g => (
                <Row key={g.id} icon="flag-variant" iconColor={c.mango} title={g.name} onPress={() => router.push(`/goal/${g.id}` as never)}
                  sub={g.put < g.need ? `Planned ${peso(g.need, { cents: false })} for this pay` : 'Your planned share for this pay'} right={<T v="num">{peso(g.put, { cents: false })}</T>} />
              ))}</List>
            ) : <T v="muted">No goals need money this pay. Add one under Goals with a target date.</T>}
          </Section>

          <Section title="Invest">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {INVEST.map(v => <Chip key={v} label={`${v}%`} selected={investPct === v} onPress={() => { setInvestPct(v); act(db => setSetting(db, 'paycheckInvestPct', v)); }} />)}
            </View>
            <T v="small" style={{ marginTop: 8 }}>{investPct ? `${peso(plan.wanted.invest, { cents: false })} of this pay, after bills, day-to-day and goals are covered.` : 'Not investing from this pay.'}</T>
          </Section>

          <View style={{ marginTop: 18, backgroundColor: c.sunk, borderRadius: radius.md, padding: 12 }}>
            <T v="small">Amounts in other currencies are counted in pesos at your saved rates. This plan doesn’t move any money; it shows where each peso should go.</T>
          </View>
        </>
      ) : (
        <View style={{ marginTop: 22 }}>
          <Note icon="cash-multiple">Enter your take-home pay to see how much is already spoken for, how much to save, and what’s free.</Note>
        </View>
      )}
    </Screen>
  );
}
