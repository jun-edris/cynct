import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useData, safeJson } from '../data/DataContext';
import { radius, useTheme } from '../theme';
import { Button, Card, Chip, DateField, Field, Icon, List, Note, Row, Screen, Section, Select, T, Toggle } from '../components/ui';
import { GradButton, NightGradient } from '../components/k';
import { useAccountOptions } from '../components/domain';
import { forecast, goalProgress, monthlyEquivalent, upcoming } from '../lib/ledger';
import { goalMove, setSetting, softDelete } from '../db/repo';
import { needsShareOf, SPLITS, splitOfPlan, targetAmounts, type Split } from '../lib/split';
import { convert, money } from '../lib/currency';
import { GUIDES, dailySpendingDetail, goalShare, guideSplit, needOrWant, nextPayday, payDays, payShareOf, planPaycheck, type GuideKey, type PlanBill } from '../lib/paycheck';
import { addDays, dayLabel, lastDayOfMonth, peso, toCentavos, todayISO } from '../lib/money';

const INVEST = [0, 5, 10, 15, 20];
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** One stacked bar of needs / wants / savings with the share printed in each part. */
function SplitBar({ label, split, pay }: { label: string; split: Split; pay: number }) {
  const { c } = useTheme();
  const parts = [[split.needs, c.blue], [split.wants, c.magenta], [split.savings, c.income]] as const;
  const total = Math.max(1, pay);
  return (
    <View accessible accessibilityLabel={`${label}: needs ${pct(split.needs / total)}, wants ${pct(split.wants / total)}, savings ${pct(split.savings / total)}`}>
      <T v="label" style={{ marginBottom: 4 }}>{label}</T>
      <View style={{ flexDirection: 'row', height: 26, borderRadius: 9, overflow: 'hidden', backgroundColor: c.sunk, gap: 2 }}>
        {parts.filter(([v]) => v > 0).map(([v, col], i) => (
          <View key={i} style={{ flex: v, backgroundColor: col, alignItems: 'center', justifyContent: 'center' }}>
            {v / total >= 0.1 ? <T v="label" color="#FFFFFF" style={{ fontSize: 12 }}>{pct(v / total)}</T> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function StackBlock({ label, value, bg, fg, min, first, last, dashed, sub }: { label: string; value: number; bg: string; fg: string; min: number; first?: boolean; last?: boolean; dashed?: boolean; sub?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ minHeight: min, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      borderTopLeftRadius: first ? 14 : 3, borderTopRightRadius: first ? 14 : 3, borderBottomLeftRadius: last ? 14 : 3, borderBottomRightRadius: last ? 14 : 3,
      borderWidth: dashed ? 2 : 0, borderStyle: dashed ? 'dashed' : 'solid', borderColor: c.ink }}>
      <View style={{ flex: 1 }}>
        <T v="medium" color={fg}>{label}</T>
        {sub ? <T v="small" color={fg} style={{ opacity: 0.75 }}>{sub}</T> : null}
      </View>
      <T v="num" color={fg} style={{ fontSize: 19 }}>{peso(value, { cents: false })}</T>
    </View>
  );
}

export default function PaycheckPlan() {
  const params = useLocalSearchParams<{ amount?: string; date?: string }>();
  const { c } = useTheme();
  const { data, baseBalances, balances, rtx, plannedBase, cats, act, rates, toast } = useData();
  const accountOptions = useAccountOptions();
  const today = todayISO();
  const payDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const [amount, setAmount] = useState(params.amount ?? '');
  const [choice, setChoice] = useState<'auto' | '15' | 'eom' | 'custom'>('auto');
  const [custom, setCustom] = useState<string | null>(null);
  const [dayOverride, setDayOverride] = useState('');
  const [investPct, setInvestPct] = useState(Number(data.settings.paycheckInvestPct ?? 10));
  const [freeToGoals, setFreeToGoals] = useState(Boolean(data.settings.paycheckFreeToGoals));

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

  const mine = data.settings.nwClass as Record<string, 'need' | 'want'> | undefined;
  const est = useMemo(() => dailySpendingDetail(rtx, today, 60, id => needOrWant(id, cats, mine) === 'want'), [rtx, today, cats, mine]);
  const estDaily = est.daily;
  const dailySpend = dayOverride ? Math.round((toCentavos(dayOverride) || 0) / days) : estDaily;

  const pay = toCentavos(amount || '0') || 0;
  // Planned income for a month, so each pay carries its fair share of every goal's month.
  const monthlyIncome = plannedBase.recurring.filter(r => r.active && r.kind === 'income')
    .reduce((s, r) => s + monthlyEquivalent(r.amount, r.frequency), 0);
  const payShare = payShareOf(pay, monthlyIncome);
  const goals = data.goals.filter(g => !g.archived).map(g => {
    const p = goalProgress({ ...g, annualRate: g.annualRate / 10_000, accountIds: safeJson<string[]>(g.accountIds, []) }, baseBalances, rtx, today);
    return { id: g.id, name: g.name, need: goalShare(g.monthly, p.needed, p.left, days, payShare), room: Math.max(0, p.left), monthly: g.monthly > 0 ? g.monthly : p.needed };
  }).filter(g => g.need > 0);

  // Emergency fund first: an unfinished emergency fund goal is filled before the others.
  const efGoal = goals.find(g => /emergency/i.test(g.name)) ?? null;
  const [efFirst, setEfFirst] = useState(data.settings.paycheckEfFirst !== false);
  const plan = planPaycheck({ amount: pay, days, bills, dailySpend, goals, investPct, freeToGoals, priorityId: efFirst && efGoal ? efGoal.id : null });

  // Moving the goal money for real: one goal deposit per goal, from the account the pay landed in.
  const assetIds = new Set(data.accounts.filter(a => !a.archived && a.type !== 'credit' && a.type !== 'loan').map(a => a.id));
  const [fromId, setFromId] = useState<string>(() => {
    const saved = data.settings.paycheckFromAccount as string | undefined;
    if (saved && assetIds.has(saved)) return saved;
    const lastPay = rtx.filter(t => t.type === 'income' && !t.deletedAt && t.accountId && assetIds.has(t.accountId)).sort((a, b) => b.date.localeCompare(a.date))[0];
    return lastPay?.accountId ?? [...assetIds][0] ?? '';
  });
  const fromAcc = data.accounts.find(a => a.id === fromId);
  const moves = plan.goals.filter(g => g.put > 0).map(g => ({ g, amt: fromAcc && fromAcc.currency !== 'PHP' ? convert(g.put, 'PHP', fromAcc.currency, rates) : g.put }));
  const moveTotal = plan.goals.reduce((x, g) => x + g.put, 0);
  const moveNow = () => {
    if (!fromAcc) return;
    if (moves.some(m => m.amt === null)) { toast(`Set a ${fromAcc.currency} rate first.`); return; }
    const have = balances.get(fromAcc.id) ?? 0;
    const need = moves.reduce((x, m) => x + (m.amt ?? 0), 0);
    if (need > have) { toast(`${fromAcc.name} has ${money(have, fromAcc.currency)}. Pick another account, or wait for the pay to land.`); return; }
    const ids: string[] = [];
    const ok = act(db => db.transaction(tx => {
      const d = tx as unknown as typeof db;
      setSetting(d, 'paycheckFromAccount', fromAcc.id);
      for (const m of moves) {
        const row = data.goals.find(x => x.id === m.g.id);
        if (row) ids.push(goalMove(d, row, 'in', fromAcc.id, m.amt!, payDate, `From this pay · ${row.name}`).id);
      }
    }), `Moved ${peso(moveTotal, { cents: false })} into ${moves.length} goal${moves.length === 1 ? '' : 's'}`, { label: 'Undo', run: () => act(db => softDelete(db, ids)) });
    if (ok) router.push({ pathname: '/saved', params: { kind: 'save', ask: '0', amount: `Saved ${peso(moveTotal, { cents: false })}`,
      title: `${moves.length} goal${moves.length === 1 ? '' : 's'} · from ${fromAcc.name}`, sub: moves.map(m => m.g.name).join(', ') } });
  };
  const afterEssentials = Math.max(0, pay - plan.needs - plan.dayToDay);
  const parts = [
    { key: 'needs', label: 'Bills due before next pay', value: plan.needs, color: c.spend, icon: 'calendar-alert' },
    { key: 'day', label: 'Day-to-day', value: plan.dayToDay, color: c.warn, icon: 'cart-outline' },
    { key: 'save', label: 'Goals', value: plan.save, color: c.mango, icon: 'flag-variant' },
    { key: 'invest', label: 'Invest', value: plan.invest, color: c.info, icon: 'chart-line' },
    { key: 'free', label: 'Free to spend', value: plan.free, color: c.income, icon: 'party-popper' },
  ];
  const saving = plan.share(plan.save + plan.invest);
  const [guideKey, setGuideKey] = useState<GuideKey>(((data.settings.paycheckGuide as GuideKey) in GUIDES ? data.settings.paycheckGuide : '50/30/20') as GuideKey);
  const guide = guideSplit(plan, pay, guideKey, est.needShare);
  const nws = [
    { k: 'needs' as const, label: 'Needs', sub: 'bills + needs in day-to-day', color: c.blue },
    { k: 'wants' as const, label: 'Wants', sub: 'wants in day-to-day + free to spend', color: c.magenta },
    { k: 'save' as const, label: 'Savings', sub: 'goals + investing', color: c.income },
  ];

  // Needs / wants / savings: this plan next to the split you aim for.
  const [splitKey, setSplitKey] = useState(String(data.settings.paycheckSplit ?? '50-30-20'));
  const preset = SPLITS.find(x => x.key === splitKey) ?? SPLITS[0];
  const needsShare = useMemo(() => needsShareOf(rtx, cats, today), [rtx, cats, today]);
  const actual = splitOfPlan(plan, needsShare);
  const target = targetAmounts(pay, preset.target);
  const toSavings = Math.max(0, target.savings - actual.savings);
  const fromWants = Math.min(toSavings, Math.max(0, actual.wants - target.wants));

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
          {/* K: the pay as a stack of blocks, from what can't wait down to what's free. */}
          <View style={{ marginTop: 22 }}>
            <T v="display" style={{ fontSize: 44, lineHeight: 50 }}>{peso(pay, { cents: false })}</T>
            <T v="muted" style={{ marginTop: 4 }}>{`has to last ${days} day${days === 1 ? '' : 's'}, until ${dayLabel(next)}`}</T>
          </View>
          <View style={{ marginTop: 14, gap: 3 }} accessibilityLabel={`How this pay is split: ${parts.map(p => `${p.label} ${peso(p.value, { cents: false })}`).join(', ')}`}>
            <StackBlock first label={`Bills before ${dayLabel(next)}`} value={plan.needs} bg={c.ink} fg={c.bg} min={52} />
            <StackBlock label="Day-to-day" value={plan.dayToDay} bg={c.blue} fg="#FFFFFF" min={52} />
            {plan.save > 0 ? (
              <NightGradient style={{ borderRadius: 3, padding: 14, minHeight: 120 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <T v="semi" color="#FFFFFF">Goals</T>
                  <T v="display" color="#FFFFFF" style={{ fontSize: 28, lineHeight: 34 }}>{peso(plan.save, { cents: false })}</T>
                </View>
                <View style={{ flex: 1, minHeight: 8 }} />
                {plan.goals.filter(g => g.put > 0).map(g => (
                  <View key={g.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.35)' }}>
                    <T v="medium" color="#FFFFFF">{g.name}</T><T v="semi" color="#FFFFFF">{peso(g.put, { cents: false })}</T>
                  </View>
                ))}
              </NightGradient>
            ) : <StackBlock label="Goals" value={0} bg={c.sunk} fg={c.muted} min={44} />}
            <StackBlock label={`Invest · ${investPct}%`} value={plan.invest} bg={c.tBlue} fg={c.ink} min={44} />
            <StackBlock last dashed label="Free to spend" value={plan.free} bg="transparent" fg={c.ink} min={44}
              sub={plan.free > 0 ? `about ${peso(Math.floor(plan.free / days), { cents: false })} a day on top of day-to-day` : undefined} />
          </View>

          <Card style={{ marginTop: 12, gap: 12 }}>
            <View style={{ gap: 8 }}>
              <T v="h3">Needs, wants, savings</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {(Object.keys(GUIDES) as GuideKey[]).map(k => <Chip key={k} label={k} selected={guideKey === k} onPress={() => { setGuideKey(k); act(db => setSetting(db, 'paycheckGuide', k)); }} />)}
              </View>
            </View>
            {([['This plan', guide.actual], [`${guideKey} guide`, guide.guide]] as const).map(([label, v]) => (
              <View key={label} style={{ gap: 6 }}>
                <T v="label">{label}</T>
                <View style={{ flexDirection: 'row', height: 26, borderRadius: 9, overflow: 'hidden', gap: 2, backgroundColor: c.sunk }}
                  accessibilityLabel={`${label}: ${nws.map(n => `${n.label} ${pct(plan.share(v[n.k]))}`).join(', ')}`}>
                  {nws.filter(n => v[n.k] > 0).map(n => (
                    <View key={n.k} style={{ flex: v[n.k], backgroundColor: n.color, justifyContent: 'center', alignItems: 'center' }}>
                      {plan.share(v[n.k]) >= 0.1 ? <T v="label" color="#FFFFFF" style={{ fontSize: 11 }}>{pct(plan.share(v[n.k]))}</T> : null}
                    </View>
                  ))}
                </View>
              </View>
            ))}
            <View style={{ gap: 6 }}>
              {nws.map(n => (
                <View key={n.k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: n.color }} />
                  <View style={{ flex: 1 }}><T v="medium">{n.label}</T><T v="small">{n.sub}</T></View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T v="num">{peso(guide.actual[n.k], { cents: false })}</T>
                    <T v="small">{`guide ${peso(guide.guide[n.k], { cents: false })}`}</T>
                  </View>
                </View>
              ))}
            </View>
            <T v="small">{guide.note ?? 'Your plan is within 5 points of the guide.'}</T>
            <T v="small">{est.daily
              ? `Day-to-day is split ${pct(est.needShare)} needs, ${pct(1 - est.needShare)} wants, going by what you spent in your last ${est.days} days.`
              : 'Day-to-day counts as needs until there’s some spending history.'}</T>
            <Button small variant="ghost" icon="tag-multiple-outline" label="Choose which categories are wants" onPress={() => router.push('/categories')} />
          </Card>

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

          <Section title="Needs, wants and savings">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SPLITS.map(x => <Chip key={x.key} label={x.label} selected={splitKey === x.key} onPress={() => { setSplitKey(x.key); act(db => setSetting(db, 'paycheckSplit', x.key)); }} />)}
            </View>
            <T v="small" style={{ marginTop: 6 }}>{preset.hint}</T>
            <Card style={{ marginTop: 10, gap: 12 }}>
              <SplitBar label="Aim for" split={target} pay={pay} />
              <SplitBar label="This plan" split={actual} pay={pay} />
              <View style={{ gap: 8 }}>
                {([['needs', 'Needs', c.blue, 0], ['wants', 'Wants', c.magenta, 1], ['savings', 'Savings', c.income, 2]] as const).map(([k, l, col, i]) => {
                  const diff = actual[k] - target[k];
                  return (
                    <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: col }} />
                      <View style={{ flex: 1 }}>
                        <T v="semi">{`${l} · aim ${preset.target[i]}%`}</T>
                        <T v="small" color={Math.abs(diff) < pay * 0.02 ? c.income : (k === 'savings' ? diff < 0 : diff > 0) ? c.warn : c.muted}>
                          {Math.abs(diff) < pay * 0.02 ? 'On target' : `${peso(Math.abs(diff), { cents: false })} ${diff > 0 ? 'over' : 'under'} the ${peso(target[k], { cents: false })} aim`}
                        </T>
                      </View>
                      <T v="num">{`${pct(plan.share(actual[k]))} · ${peso(actual[k], { cents: false })}`}</T>
                    </View>
                  );
                })}
              </View>
            </Card>
            <T v="small" style={{ marginTop: 8 }}>{`Needs are bills plus about ${pct(needsShare)} of your day-to-day (groceries, transport, health, family), from how you’ve been spending. Eating out, shopping and fun count as wants. Free money counts as wants until you put it to work.`}</T>
            {toSavings > 0 ? (
              <View style={{ marginTop: 8 }}>
                <Note tone="info" icon="lightbulb-on-outline">{fromWants > 0
                  ? `To save ${preset.target[2]}%, move ${peso(fromWants, { cents: false })} from wants to savings${freeToGoals ? '' : ': turn on “Put what’s free into goals” below, or raise investing'}.`
                  : `Savings are ${peso(toSavings, { cents: false })} short of ${preset.target[2]}%, and wants are already within the aim. Needs are taking the room this pay.`}</Note>
              </View>
            ) : null}
          </Section>

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
              hint={estDaily ? `Cynct’s estimate: about ${peso(estDaily, { cents: false })} a day, from your last ${est.days} days${est.oneOffs ? `, leaving out ${est.oneOffs === 1 ? 'one big one-off' : `${est.oneOffs} big one-offs`} (${peso(est.oneOffTotal, { cents: false })})` : ''}. Type your own to change it.` : 'Not enough history yet. Type what you expect to spend.'} />
          </Section>

          <Section title="Goals" aside={plan.wanted.save ? peso(plan.save, { cents: false }) : undefined}>
            {plan.goals.length ? (
              <List>{plan.goals.map(g => (
                <Row key={g.id} icon="flag-variant" iconColor={c.mango} title={g.name} onPress={() => router.push(`/goal/${g.id}` as never)}
                  sub={g.put < g.need ? `Planned ${peso(g.need, { cents: false })} for this pay` : g.put > g.need ? `${peso(g.need, { cents: false })} keeps it on track, the rest is extra` : `Keeps it on track · ${peso(g.monthly ?? 0, { cents: false })} a month`}
                  right={<T v="num">{peso(g.put, { cents: false })}</T>} />
              ))}</List>
            ) : <T v="muted">No goals need money this pay. Add one under Goals with a target date.</T>}
            {plan.goals.length ? (
              <View style={{ gap: 10, marginTop: 10 }}>
                <T v="small">{payShare !== null
                  ? `This pay is ${Math.round(payShare * 100)}% of your planned ${peso(monthlyIncome, { cents: false })} a month, so it carries ${Math.round(payShare * 100)}% of each goal’s monthly amount.`
                  : `No planned income yet, so goals get a ${days}-day share of their monthly amount. Add your income under Planned payments to split by pay size instead.`}</T>
                <T v="small">{`After bills and day-to-day, up to ${peso(afterEssentials, { cents: false })} of this pay could go to goals.`}</T>
                <Toggle label="Put what’s free into goals" hint="Anything left after investing tops up your goals, split the same way." value={freeToGoals}
                  onChange={(v) => { setFreeToGoals(v); act(db => setSetting(db, 'paycheckFreeToGoals', v)); }} />
                {efGoal ? <Toggle label={`${efGoal.name} first`} hint="It gets its full share before other goals, and free money tops it up first. Turns itself off in effect once it’s full." value={efFirst}
                  onChange={(v) => { setEfFirst(v); act(db => setSetting(db, 'paycheckEfFirst', v)); }} /> : null}
              </View>
            ) : null}
          </Section>

          <Section title="Invest">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {INVEST.map(v => <Chip key={v} label={`${v}%`} selected={investPct === v} onPress={() => { setInvestPct(v); act(db => setSetting(db, 'paycheckInvestPct', v)); }} />)}
            </View>
            <T v="small" style={{ marginTop: 8 }}>{investPct ? `${peso(plan.wanted.invest, { cents: false })} of this pay, after bills, day-to-day and goals are covered.` : 'Not investing from this pay.'}</T>
          </Section>

          {moves.length ? (
            <Section title="Move the goal money now">
              <Select label="From" value={fromId} options={accountOptions.filter(o => assetIds.has(o.value))} onChange={setFromId} />
              <GradButton label={`Move ${peso(moveTotal, { cents: false })} into ${moves.length} goal${moves.length === 1 ? '' : 's'}`} onPress={moveNow} style={{ marginTop: 12 }} />
              <T v="small" style={{ marginTop: 8 }}>Records a goal deposit for each goal above, dated {dayLabel(payDate)}. You can undo it right after.</T>
            </Section>
          ) : null}

          <View style={{ marginTop: 18, backgroundColor: c.sunk, borderRadius: radius.md, padding: 12 }}>
            <T v="small">Amounts in other currencies are counted in pesos at your saved rates. Nothing moves until you tap Move; bills and investing stay a plan.</T>
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
