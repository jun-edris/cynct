import React, { useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useData } from '../data/DataContext';
import { radius, space, useTheme } from '../theme';
import { Bar, Icon, IconBubble, IconButton, Segmented, T, close } from '../components/ui';
import { Logo } from '../components/Logo';
import { buildRecap, rootName } from '../lib/recap';
import { FEES_CATEGORY } from '../lib/ledger';
import { addDays, compactPeso, dayLabel, lastDayOfMonth, monthLabel, peso, todayISO } from '../lib/money';

type Range = 'month' | 'year';

export default function RecapScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data, rtx, cats, catById } = useData();
  const [range, setRange] = useState<Range>('month');
  const [page, setPage] = useState(0);
  const [pageH, setPageH] = useState(0);
  const today = todayISO();
  const lastMonthStart = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7) + '-01';
  const start = range === 'month' ? lastMonthStart : `${today.slice(0, 4)}-01-01`;
  const end = range === 'month' ? lastDayOfMonth(lastMonthStart) : today;
  const r = buildRecap(rtx, cats, start, end);
  const title = range === 'month' ? monthLabel(lastMonthStart.slice(0, 7)) : `${today.slice(0, 4)} so far`;
  const nameOf = (id: string) => (id === FEES_CATEGORY ? 'Fees' : rootName(id, data.categories));
  const colorOf = (id: string) => catById.get(id)?.color ?? c.mango;

  const card = (bg: string, ink: string, children: React.ReactNode) => (
    <View style={{ width, height: pageH || undefined, paddingHorizontal: space.page }}>
      <View style={{ flex: 1, backgroundColor: bg, borderRadius: radius.xl, padding: 24, justifyContent: 'space-between' }}>
        <T v="label" color={ink} style={{ opacity: 0.7 }}>{title}</T>
        <View style={{ gap: 14 }}>{children}</View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: 0.8 }}>
          <Logo size={22} tile={false} bar={ink} mango={bg === c.mango ? c.navy : c.mango} />
          <T v="semi" color={ink}>Cynct recap</T>
        </View>
      </View>
    </View>
  );

  const pages = [
    card(c.mango, c.onMango, <>
      <T v="h2" color={c.onMango}>You spent</T>
      <T v="display" color={c.onMango} style={{ fontSize: 48, lineHeight: 54 }}>{peso(r.expense, { cents: false })}</T>
      <T v="medium" color={c.onMango}>{`and earned ${peso(r.income, { cents: false })}.`}</T>
      {r.savingsRate !== null ? <T v="h3" color={c.onMango}>{r.savingsRate >= 0 ? `You kept ${Math.round(r.savingsRate * 100)}% of it.` : `That’s ${peso(-r.net, { cents: false })} more out than in.`}</T> : null}
    </>),
    card(c.navy, c.navyText, <>
      <T v="h2" color={c.navyText}>Where it went</T>
      {r.top.length ? r.top.map((t, i) => (
        <View key={t.id} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="semi" color={c.navyText}>{`${i + 1}. ${nameOf(t.id)}`}</T>
            <T v="num" color={c.navyText}>{compactPeso(t.amount)}</T>
          </View>
          <Bar pct={t.share} color={colorOf(t.id)} track={c.navyLine} />
        </View>
      )) : <T v="medium" color={c.navyMuted}>No spending logged in this period.</T>}
    </>),
    card(c.surface, c.ink, <>
      <T v="h2">Biggest moments</T>
      {r.biggest ? (
        <View style={{ gap: 2 }}>
          <T v="label">Biggest single expense</T>
          <T v="numLg">{peso(r.biggest.amount, { cents: false })}</T>
          <T v="muted">{`${r.biggest.note || nameOf(r.biggest.categoryId ?? 'uncategorized')} · ${dayLabel(r.biggest.date)}`}</T>
        </View>
      ) : null}
      {r.busiest ? (
        <View style={{ gap: 2 }}>
          <T v="label">Biggest spending day</T>
          <T v="numLg">{dayLabel(r.busiest.date)}</T>
          <T v="muted">{peso(r.busiest.amount, { cents: false })}</T>
        </View>
      ) : null}
      <View style={{ gap: 2 }}>
        <T v="label">Average a day</T>
        <T v="numLg">{peso(r.avgPerDay, { cents: false })}</T>
      </View>
    </>),
    card(c.navy, c.navyText, <>
      <T v="h2" color={c.navyText}>Your habits</T>
      {[[`${r.daysLogged} of ${r.days}`, 'days with something logged', 'calendar-check'], [`${r.bestStreak} days`, 'longest logging streak', 'fire'],
        [`${r.entries}`, 'entries in total', 'format-list-bulleted']].map(([v, l, icon]) => (
        <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <IconBubble icon={icon} color={c.mango} size={48} />
          <View><T v="numLg" color={c.navyText}>{v}</T><T v="medium" color={c.navyMuted}>{l}</T></View>
        </View>
      ))}
    </>),
    card(c.mango, c.onMango, <>
      <T v="h3" color={c.onMango}>Your money style</T>
      <Icon name={r.personality.icon} size={64} color={c.onMango} />
      <T v="display" color={c.onMango} style={{ fontSize: 40, lineHeight: 46 }}>{r.personality.title}</T>
      <T v="medium" color={c.onMango}>{r.personality.blurb}</T>
    </>),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}>
      <View style={{ paddingHorizontal: space.page, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <IconButton name="close" label="Close" onPress={close} filled />
        <View style={{ flex: 1 }}>
          <Segmented value={range} onChange={(v) => { setRange(v); setPage(0); }} options={[['month', 'Last month'], ['year', 'This year']]} />
        </View>
      </View>
      <ScrollView key={range} horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ flex: 1 }}
        onLayout={e => setPageH(e.nativeEvent.layout.height)}
        onMomentumScrollEnd={e => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}>
        {pages.map((p, i) => <React.Fragment key={i}>{p}</React.Fragment>)}
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 14 }}>
        {pages.map((_, i) => <View key={i} style={{ width: i === page ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i === page ? c.mango : c.line }} />)}
      </View>
      <T v="small" style={{ textAlign: 'center', marginTop: 8 }}>Swipe for more</T>
    </View>
  );
}
