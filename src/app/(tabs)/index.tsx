import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useData, safeJson } from '../../data/DataContext';
import { isPayable, usePayUpcoming } from '../../data/actions';
import { radius, useTheme } from '../../theme';
import { Bar, Block, Button, Card, Empty, Icon, IconBubble, IconButton, List, Screen, Section, StatTile, T } from '../../components/ui';
import { readLayout, type HomeSection } from '../../lib/home';
import { draftsFrom, readCapture } from '../../data/capture';
import { EyeButton, Hills, TxRow, UpcomingRow } from '../../components/domain';
import { compactPeso, monthKey, peso, todayISO, parseISO, nowMs } from '../../lib/money';
import { budgetStatus, goalProgress, monthRange, netWorth, streak, summarize, upcoming } from '../../lib/ledger';

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const { c, dark } = useTheme();
  const { data, baseBalances, rtx, cats, goalFunds, plannedBase, missing } = useData();
  const pay = usePayUpcoming();
  const today = todayISO();
  const nw = netWorth(data.accounts, baseBalances, goalFunds);
  const { start, end } = monthRange(monthKey(today));
  const month = summarize(rtx, start, end, cats);
  const day = summarize(rtx, today, today, cats);
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
  const dateLabel = parseISO(today).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });

  const capturePrefs = readCapture(data.settings);
  const toReview = capturePrefs.enabled ? draftsFrom(data.captured, capturePrefs).drafts.length : 0;
  const alerts = (<>
      {toReview ? (
        <Card style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.infoSoft }} onPress={() => router.push('/capture')}>
          <Icon name="bell-badge-outline" color={c.info} />
          <T v="medium" style={{ flex: 1 }}>{`${toReview} payment${toReview === 1 ? '' : 's'} from your notifications to review`}</T>
          <Icon name="chevron-right" color={c.info} />
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
    networth: (<>
      <Block tone="mango" style={{ marginTop: 18 }} onPress={() => router.push('/overview')}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T v="semi" color={c.onMango} style={{ opacity: 0.75 }}>Net worth</T>
          <Icon name="arrow-top-right" size={20} color={c.onMango} />
        </View>
        <T v="display" color={c.onMango} style={{ marginTop: 6, fontSize: 42, lineHeight: 48 }} numberOfLines={1}>{peso(nw.net, { cents: false })}</T>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          {[['You have', nw.assets], ['You owe', -nw.liabilities]].map(([l, v]) => (
            <View key={String(l)} style={{ flex: 1, backgroundColor: 'rgba(11,20,38,0.08)', borderRadius: radius.md, padding: 12 }}>
              <T v="label" color={c.onMango} style={{ opacity: 0.7 }}>{String(l)}</T>
              <T v="num" color={c.onMango} style={{ fontSize: 18, marginTop: 2 }}>{compactPeso(Number(v))}</T>
            </View>
          ))}
        </View>
      </Block>

    </>),
    stats: (<>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <StatTile label="Spent today" value={compactPeso(day.expense)} />
        <StatTile label={`${parseISO(today).toLocaleDateString('en-PH', { month: 'long' })} in`} value={compactPeso(month.income)} color={c.income} />
        <StatTile label="Spent" value={compactPeso(month.expense)} color={c.spend} />
      </View>

    </>),
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
                <T v="medium" color={c.navyMuted}>of {compactPeso(goal.target)} · {g.monthsLeft} months left · needs {compactPeso(g.needed)}/mo</T>
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
    <Screen headerless padBottom={130}>
      <View style={{ paddingTop: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <T v="label">{dateLabel}</T>
          <T v="title" style={{ marginTop: 2 }}>{greeting()}</T>
        </View>
        <Pressable onPress={() => router.push('/history')} accessibilityRole="button" accessibilityLabel={`${st.current} day logging streak`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: st.loggedToday ? c.mangoSoft : c.surface, borderRadius: radius.pill, paddingHorizontal: 12, height: 40, marginRight: 6 }}>
          <Icon name={st.current ? 'fire' : 'fire-off'} size={20} color={st.current ? c.mango : c.faint} />
          <T v="num" style={{ fontSize: 15 }}>{st.current}</T>
        </Pressable>
        <EyeButton />
        <View style={{ width: 6 }} />
        <IconButton name="cog-outline" label="Settings" onPress={() => router.push('/settings')} filled />
      </View>

      {layout.order.filter(k => !layout.hidden.includes(k)).map((k, i) => (
        <React.Fragment key={k}>
          {blocks[k]}
          {/* Warnings sit right after the first section so they're always seen. */}
          {i === 0 ? alerts : null}
        </React.Fragment>
      ))}
      {recap ? (
        <Card style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }} onPress={() => router.push('/recap')}>
          <IconBubble icon="play-circle-outline" color={c.mango} />
          <View style={{ flex: 1 }}><T v="semi">{recap}</T><T v="small">Top categories, biggest moments and your money style.</T></View>
          <Icon name="chevron-right" color={c.faint} />
        </Card>
      ) : null}
    </Screen>
  );
}
