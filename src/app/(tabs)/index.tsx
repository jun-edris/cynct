import React, { useEffect, useState } from 'react';
import { Animated, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Polygon, Polyline } from 'react-native-svg';
import { router } from 'expo-router';
import { useData, safeJson } from '../../data/DataContext';
import { isPayable, usePayUpcoming } from '../../data/actions';
import { fonts, useTheme } from '../../theme';
import { Bar, Block, Button, Card, Empty, Icon, IconBubble, List, Screen, Section, T } from '../../components/ui';
import { readLayout, type HomeSection } from '../../lib/home';
import { draftsFrom, readCapture } from '../../data/capture';
import { Hills, TxRow, UpcomingRow } from '../../components/domain';
import { Glass, NightGradient, OnNightPill, SentiBadge, SheetUp, useCountUp, useReduceMotion } from '../../components/k';
import { lastMonths, monthFlow } from '../../lib/flow';
import { setSetting } from '../../db/repo';
import { compactPeso, peso, todayISO, parseISO, nowMs } from '../../lib/money';
import { budgetStatus, goalProgress, leftLabel, netWorth, streak, upcoming } from '../../lib/ledger';

/** A round glass button for the gradient header. */
function GlassButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.13)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.26)', transform: [{ scale: pressed ? 0.92 : 1 }] })}>
      <Icon name={icon} size={20} color="#FFFFFF" />
    </Pressable>
  );
}

const IN = '#8BF0BC', OUT = '#FF9CCB';

/** Running income vs spending this month, drawn left to right once. */
function MonthLines({ inc, out, width }: { inc: number[]; out: number[]; width: number }) {
  const reduce = useReduceMotion();
  const [reveal] = useState(() => new Animated.Value(reduce ? 1 : 0));
  useEffect(() => { if (!reduce) Animated.timing(reveal, { toValue: 1, duration: 1200, delay: 200, useNativeDriver: false }).start(); }, [reveal, reduce]);
  const H = 92, n = Math.max(2, inc.length);
  const max = Math.max(1, inc[inc.length - 1] ?? 0, out[out.length - 1] ?? 0);
  const pts = (arr: number[]) => arr.map((v, i) => `${(i / (n - 1)) * (width - 6)},${H - 4 - (v / max) * (H - 10)}`).join(' ');
  const incPts = pts(inc), outPts = pts(out);
  return (
    <Animated.View style={{ width: reveal.interpolate({ inputRange: [0, 1], outputRange: [0, width] }), overflow: 'hidden', marginTop: 8 }}>
      <Svg width={width} height={H}>
        <Line x1={0} y1={H - 4} x2={width} y2={H - 4} stroke="rgba(255,255,255,0.25)" />
        <Polygon points={`0,${H - 4} ${incPts} ${width - 6},${H - 4}`} fill="rgba(139,240,188,0.14)" />
        <Polyline points={incPts} fill="none" stroke={IN} strokeWidth={2.5} strokeLinejoin="round" />
        <Polyline points={outPts} fill="none" stroke={OUT} strokeWidth={2.5} strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  );
}

/** Six months of income and spending as paired bars that grow up from the baseline. */
function MonthBars({ months }: { months: { key: string; income: number; expense: number }[] }) {
  const reduce = useReduceMotion();
  const [grow] = useState(() => new Animated.Value(reduce ? 1 : 0));
  useEffect(() => { if (!reduce) Animated.timing(grow, { toValue: 1, duration: 800, useNativeDriver: true }).start(); }, [grow, reduce]);
  const max = Math.max(1, ...months.map(m => Math.max(m.income, m.expense)));
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8, height: 92, alignItems: 'flex-end', marginTop: 8 }}>
        {months.map(m => m.income || m.expense ? (
          <View key={m.key} style={{ flex: 1, flexDirection: 'row', gap: 3, alignItems: 'flex-end', height: '100%' }}>
            {[[m.income, IN], [m.expense, OUT]].map(([v, col], i) => (
              <Animated.View key={i} style={{ flex: 1, height: `${Math.max(3, (Number(v) / max) * 100)}%`, borderRadius: 5, backgroundColor: String(col),
                transformOrigin: 'bottom', transform: [{ scaleY: grow }] }} />
            ))}
          </View>
        ) : <View key={m.key} style={{ flex: 1, height: 6, borderRadius: 4, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.4)' }} />)}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        {months.map(m => <T key={m.key} v="label" color="#E7E0FF" center style={{ flex: 1, fontSize: 11 }}>{parseISO(`${m.key}-01`).toLocaleDateString('en-PH', { month: 'short' })}</T>)}
      </View>
    </View>
  );
}

export default function Home() {
  const { c, dark } = useTheme();
  const { data, act, baseBalances, rtx, cats, goalFunds, plannedBase, missing } = useData();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [view, setView] = useState<'month' | 'half'>('month');
  const pay = usePayUpcoming();
  const today = todayISO();
  const nw = netWorth(data.accounts, baseBalances, goalFunds);
  const flow = monthFlow(rtx, today);
  const months = lastMonths(rtx, today);
  const shownNet = useCountUp(nw.net);
  const hidden = data.settings.hideAmounts === true;
  const monthShort = parseISO(today).toLocaleDateString('en-PH', { month: 'short' });
  const st = streak(data.transactions, today);
  const goal = data.goals.find(g => !g.archived);
  const soon = upcoming(plannedBase.recurring, plannedBase.installments.filter(i => i.paidCount < i.months), today, 14).slice(0, 5);
  const recent = data.transactions.filter(t => t.date <= today).slice(0, 6);
  const budgets = data.budgets.filter(b => b.kind !== 'income').map(b => ({ b, s: budgetStatus(b, rtx, cats, today) }))
    .sort((x, y) => y.s.pct - x.s.pct).slice(0, 3);
  const pinned = data.notes.find(n => n.pinned);
  const layout = readLayout(data.settings.homeLayout);
  // In the first week of a month, offer last month's recap.
  const dom = Number(today.slice(8));
  const lastMonth = parseISO(`${today.slice(0, 7)}-01`); lastMonth.setMonth(lastMonth.getMonth() - 1);
  const recap = dom <= 7 && data.transactions.length >= 5 ? `Your ${lastMonth.toLocaleDateString('en-PH', { month: 'long' })} recap is ready` : null;
  const hasFolder = !!data.settings.backupFolderUri;
  const lastManual = data.settings.lastManualBackup as number | undefined;
  const needsBackup = !hasFolder && data.transactions.length >= 10 && (!lastManual || nowMs() - lastManual > 14 * 86_400_000);

  const capturePrefs = readCapture(data.settings);
  const toReview = capturePrefs.enabled ? draftsFrom(data.captured, capturePrefs).drafts.length : 0;
  const alerts = (<>
      {toReview ? (
        <Card style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.tViolet }} onPress={() => router.push('/capture')}>
          <SentiBadge size={40} />
          <View style={{ flex: 1 }}>
            <T v="semi">{`${toReview} payment${toReview === 1 ? '' : 's'} to sort`}</T>
            <T v="small">From your notifications and screenshots</T>
          </View>
          <View style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
            <T v="semi" color={c.bg} style={{ fontSize: 13 }}>Sort</T>
          </View>
        </Card>
      ) : null}
      {missing.length ? (
        <Card style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.warnSoft }} onPress={() => router.push('/currencies')}>
          <Icon name="currency-usd-off" color={c.warn} />
          <T v="medium" style={{ flex: 1 }}>{`Set a ${missing.join(', ')} rate so those accounts count in your totals.`}</T>
          <Icon name="chevron-right" color={c.warn} />
        </Card>
      ) : null}
      {needsBackup ? (
        <Card style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.warnSoft }} onPress={() => router.push('/settings')}>
          <Icon name="cloud-alert" color={c.warn} />
          <T v="medium" style={{ flex: 1 }}>Backups only live on this phone. Pick a Google Drive folder in Settings.</T>
          <Icon name="chevron-right" color={c.warn} />
        </Card>
      ) : null}

  </>);
  const blocks: Record<HomeSection, React.ReactNode> = {
    // Net worth and this month's in/out live in the gradient header now.
    networth: null,
    stats: null,
    goal: (<>
      {goal ? (() => {
        const g = goalProgress({ ...goal, annualRate: goal.annualRate / 10_000, accountIds: safeJson<string[]>(goal.accountIds, []) }, baseBalances, rtx, today);
        return (
          <Section title="Goal" action="All goals" onAction={() => router.push('/goals')}>
            <Block tone="navy" style={{ paddingBottom: 0, paddingHorizontal: 0 }} onPress={() => router.push(`/goal/${goal.id}`)}>
              <View style={{ paddingHorizontal: 20 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T v="semi" color={c.navyMuted}>{goal.name}</T>
                  <T v="semi" color={c.mango}>{Math.round(g.pct * 1000) / 10}%</T>
                </View>
                <T v="display" color={c.navyText} style={{ marginTop: 4, fontSize: 36, lineHeight: 42 }}>{peso(g.saved, { cents: false })}</T>
                <T v="medium" color={c.navyMuted}>of {compactPeso(goal.target)} · {leftLabel(g.months)} · needs {compactPeso(g.needed)}{g.months < 1 ? '' : '/mo'}</T>
              </View>
              <View style={{ marginTop: 10 }}>
                <Hills pct={g.pct} label={compactPeso(goal.target)} fill={c.mango} back={dark ? '#24365C' : '#16233F'} mid={dark ? '#2C4170' : '#1F3155'} ink={c.navyText} house={c.mango} />
              </View>
            </Block>
          </Section>
        );
      })() : (
        <Section title="Goal"><Empty icon="flag-outline" title="Set your first goal" text="A house, an emergency fund, a trip. See exactly how far you are." action="Create a goal" onAction={() => router.push('/goal-edit/new')} /></Section>
      )}

    </>),
    budgets: (<>
      {budgets.length ? (
        <Section title="Budgets" action="All budgets" onAction={() => router.push('/budgets')}>
          <Card style={{ gap: 16 }}>
            {budgets.map(({ b, s }) => (
              <Pressable key={b.id} onPress={() => router.push(`/budget/${b.id}`)} style={{ gap: 8 }} accessibilityRole="button">
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T v="semi">{b.name}</T>
                  <T v="medium" color={s.remaining < 0 ? c.spend : c.muted}>{s.remaining < 0 ? `${peso(-s.remaining)} over` : `${peso(s.remaining)} left`}</T>
                </View>
                <Bar pct={s.pct} over={s.remaining < 0} />
              </Pressable>
            ))}
          </Card>
        </Section>
      ) : null}

    </>),
    upcoming: (<>
      <Section title="Coming up" action="Forecast" onAction={() => router.push('/forecast')}>
        {soon.length ? <List>{soon.map(item => <UpcomingRow key={item.key} item={item} onPay={isPayable(item, data) ? () => pay(item) : undefined} />)}</List>
          : <Empty icon="calendar-check-outline" title="Nothing due in the next 2 weeks" action="Plan a payment" onAction={() => router.push('/recurring/new')} />}
      </Section>

    </>),
    note: (<>
      {pinned ? (
        <Section title="Pinned note">
          <Card onPress={() => router.push(`/note/${pinned.id}`)} style={{ gap: 4 }}>
            <T v="h3">{pinned.title || 'Note'}</T>
            <T v="muted" numberOfLines={3}>{pinned.body}</T>
          </Card>
        </Section>
      ) : null}

    </>),
    recent: (<>
      <Section title="Recent" action="History" onAction={() => router.navigate('/history')}>
        {recent.length ? <List>{recent.map(t => <TxRow key={t.id} t={t} showDate />)}</List>
          : <Empty icon="receipt" title="Nothing logged yet" text="Tap + to add your first expense, or type “lunch 180 gcash”." />}
      </Section>
      {!recent.length ? <Button label="Add an expense" icon="plus" style={{ marginTop: 14 }} onPress={() => router.push({ pathname: '/tx/[id]', params: { id: 'new', type: 'expense' } })} /> : null}
    </>),
  };
  return (
    <Screen headerless padBottom={130} edge>
      <NightGradient style={{ marginHorizontal: -18, paddingTop: insets.top + 12, paddingHorizontal: 18, paddingBottom: 46 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T v="h2" color="#FFFFFF" style={{ flex: 1, fontFamily: fonts.numBlack, fontSize: 21 }}>cynct</T>
          <Pressable onPress={() => router.push('/history')} accessibilityRole="button" accessibilityLabel={`${st.current} day logging streak`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 40, paddingHorizontal: 12, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.13)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.26)' }}>
            <Icon name={st.current ? 'fire' : 'fire-off'} size={18} color={st.current ? c.amber : '#E7E0FF'} />
            <T v="num" color="#FFFFFF" style={{ fontSize: 14 }}>{st.current}</T>
          </Pressable>
          <GlassButton icon={hidden ? 'eye-off-outline' : 'eye-outline'} label={hidden ? 'Show amounts' : 'Hide amounts'} onPress={() => act(db => setSetting(db, 'hideAmounts', !hidden))} />
          <GlassButton icon="cog-outline" label="Settings" onPress={() => router.push('/settings')} />
        </View>
        <Pressable onPress={() => router.push('/overview')} accessibilityRole="button" accessibilityLabel={`Net worth ${peso(nw.net, { cents: false })}. Open overview`} style={{ marginTop: 14 }}>
          <T v="medium" color="#E7E0FF">You have</T>
          <T v="display" color="#FFFFFF" style={{ fontSize: 50, lineHeight: 58, marginTop: 2 }} numberOfLines={1}>{peso(hidden ? nw.net : shownNet, { cents: false })}</T>
        </Pressable>

        <Glass style={{ marginTop: 12, padding: 12, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View><T v="label" color="#E7E0FF">{`In · ${monthShort}`}</T><T v="num" color={IN} style={{ fontSize: 17 }}>{compactPeso(flow.income)}</T></View>
            <View><T v="label" color="#E7E0FF">{`Out · ${monthShort}`}</T><T v="num" color={OUT} style={{ fontSize: 17 }}>{compactPeso(flow.expense)}</T></View>
            <View style={{ flex: 1 }} />
            <View style={{ flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)' }} accessibilityRole="radiogroup">
              {([['month', 'Month'], ['half', '6 months']] as const).map(([k, l]) => (
                <Pressable key={k} onPress={() => setView(k)} accessibilityRole="radio" accessibilityState={{ selected: view === k }}
                  style={{ height: 28, paddingHorizontal: 10, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: view === k ? '#FFFFFF' : 'transparent' }}>
                  <T v="label" color={view === k ? '#17122D' : '#FFFFFF'} style={{ fontSize: 12, fontFamily: view === k ? fonts.semi : fonts.medium }}>{l}</T>
                </Pressable>
              ))}
            </View>
          </View>
          {view === 'month' ? (
            <View accessible accessibilityLabel={`This month so far: in ${peso(flow.income, { cents: false })}, out ${peso(flow.expense, { cents: false })}`}>
              <MonthLines key={`m${today}`} inc={flow.inc} out={flow.out} width={width - 60} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T v="label" color="#E7E0FF" style={{ fontSize: 11 }}>{`${monthShort} 1`}</T>
                <T v="label" color="#E7E0FF" style={{ fontSize: 11 }}>{`Net ${peso(flow.income - flow.expense, { cents: false, sign: true })}`}</T>
                <T v="label" color="#E7E0FF" style={{ fontSize: 11 }}>Today</T>
              </View>
            </View>
          ) : <MonthBars months={months} />}
        </Glass>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <OnNightPill label="Spend" style={{ flex: 1 }} icon={<Icon name="arrow-up" size={18} color="#D23A7E" />} onPress={() => router.push({ pathname: '/tx/[id]', params: { id: 'new', type: 'expense' } })} />
          <OnNightPill label="Income" style={{ flex: 1 }} icon={<Icon name="arrow-down" size={18} color="#0F7A4A" />} onPress={() => router.push({ pathname: '/tx/[id]', params: { id: 'new', type: 'income' } })} />
          <OnNightPill label="Move" style={{ flex: 1 }} icon={<Icon name="swap-horizontal" size={18} color="#6B3BF5" />} onPress={() => router.push({ pathname: '/transfer/[id]', params: { id: 'new' } })} />
        </View>
      </NightGradient>

      <SheetUp style={{ marginHorizontal: -18, paddingHorizontal: 18, paddingTop: 4 }}>
      {alerts}
      {layout.order.filter(k => !layout.hidden.includes(k)).map(k => <React.Fragment key={k}>{blocks[k]}</React.Fragment>)}
      {recap ? (
        <Card style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }} onPress={() => router.push('/recap')}>
          <IconBubble icon="play-circle-outline" color={c.mango} />
          <View style={{ flex: 1 }}><T v="semi">{recap}</T><T v="small">Top categories, biggest moments and your money style.</T></View>
          <Icon name="chevron-right" color={c.faint} />
        </Card>
      ) : null}
      </SheetUp>
    </Screen>
  );
}
