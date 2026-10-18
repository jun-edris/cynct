import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useData } from '../data/DataContext';
import { radius, useTheme } from '../theme';
import { Bar, Card, Empty, IconBubble, IconButton, List, Row, Screen, Section, Select, StatTile, T } from '../components/ui';
import { TxRow } from '../components/domain';
import { FEES_CATEGORY, dailyTotals, monthRange, summarize } from '../lib/ledger';
import { addMonths, compactPeso, dayLabel, lastDayOfMonth, monthLabel, peso, todayISO } from '../lib/money';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function Calendar() {
  const { c } = useTheme();
  const { data, cats, catById, rtx } = useData();
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [accountId, setAccountId] = useState('');
  const [day, setDay] = useState<string | null>(today.startsWith(month) ? today : null);
  const { start, end } = monthRange(month);
  const txs = useMemo(() => accountId ? rtx.filter(t => t.accountId === accountId || t.toAccountId === accountId) : rtx, [rtx, accountId]);
  const sum = summarize(txs, start, end, cats);
  const daily = dailyTotals(txs, start, end);
  const maxDay = Math.max(1, ...[...daily.values()].map(v => v.expense));
  const roots = [...sum.byRoot.entries()].sort((a, b) => b[1] - a[1]);
  const accountOptions = [{ value: '', label: 'All accounts', icon: 'wallet-outline' }, ...data.accounts.map(a => ({ value: a.id, label: a.name, icon: a.icon, color: a.color }))];

  // Monday-first grid with leading blanks.
  const firstDow = (new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).getDay() + 6) % 7;
  const nDays = Number(lastDayOfMonth(start).slice(8));
  const cells: (string | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: nDays }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  const dayTxs = day ? txs.filter(t => t.date === day) : [];

  const go = (n: number) => { const m = addMonths(`${month}-01`, n).slice(0, 7); setMonth(m); setDay(null); };

  return (
    <Screen title="Calendar" back>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton name="chevron-left" label="Previous month" onPress={() => go(-1)} filled />
        <T v="h2">{monthLabel(month)}</T>
        <IconButton name="chevron-right" label="Next month" onPress={() => go(1)} filled />
      </View>
      <View style={{ marginTop: 12 }}><Select label="Account" value={accountId} options={accountOptions} onChange={setAccountId} compact /></View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <StatTile label="Income" value={compactPeso(sum.income)} color={c.income} />
        <StatTile label="Spent" value={compactPeso(sum.expense)} color={c.spend} />
        <StatTile label="Net" value={`${sum.net >= 0 ? '+' : '−'}${compactPeso(Math.abs(sum.net))}`} color={sum.net >= 0 ? c.income : c.spend} />
      </View>

      <Card style={{ marginTop: 12, padding: 10 }}>
        <View style={{ flexDirection: 'row' }}>
          {WEEKDAYS.map((w, i) => <T key={i} v="label" style={{ flex: 1, textAlign: 'center', marginBottom: 6 }}>{w}</T>)}
        </View>
        {Array.from({ length: cells.length / 7 }, (_, r) => (
          <View key={r} style={{ flexDirection: 'row' }}>
            {cells.slice(r * 7, r * 7 + 7).map((d, i) => {
              if (!d) return <View key={i} style={{ flex: 1, aspectRatio: 0.8 }} />;
              const v = daily.get(d);
              const sel = d === day;
              const heat = v?.expense ? 0.12 + 0.5 * (v.expense / maxDay) : 0;
              return (
                <Pressable key={i} onPress={() => setDay(sel ? null : d)} accessibilityRole="button" accessibilityLabel={`${dayLabel(d)}${v ? `, spent ${peso(v.expense)}` : ''}`}
                  style={{ flex: 1, aspectRatio: 0.8, margin: 2, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', gap: 1,
                    backgroundColor: sel ? c.navy : heat ? c.mango + Math.round(heat * 255).toString(16).padStart(2, '0') : 'transparent',
                    borderWidth: d === today && !sel ? 1.5 : 0, borderColor: c.ink }}>
                  <T v="semi" color={sel ? c.navyText : c.ink} style={{ fontSize: 13 }}>{Number(d.slice(8))}</T>
                  {v?.expense ? <T v="label" color={sel ? c.navyText : c.ink} style={{ fontSize: 9 }}>{compactPeso(v.expense)}</T> : null}
                  {v?.income ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.income }} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
        <T v="small" style={{ marginTop: 6, textAlign: 'center' }}>Darker days = more spending · green dot = income</T>
      </Card>

      {day ? (
        <Section title={dayLabel(day)} aside={dayTxs.length ? `${dayTxs.length} entr${dayTxs.length === 1 ? 'y' : 'ies'}` : undefined}>
          {dayTxs.length ? <List>{dayTxs.map(t => <TxRow key={t.id} t={t} />)}</List> : <Empty icon="calendar-blank-outline" title="Nothing on this day" />}
        </Section>
      ) : null}

      <Section title="Where it went">
        {roots.length ? <List>{roots.map(([id, amt]) => {
          const cat = catById.get(id);
          const name = id === FEES_CATEGORY ? 'Fees' : cat?.name ?? 'Uncategorized';
          return <Row key={id} left={<IconBubble icon={cat?.icon ?? (id === FEES_CATEGORY ? 'percent' : 'help')} color={cat?.color ?? c.faint} />} title={name}
            sub={<View style={{ marginTop: 6 }}><Bar pct={sum.expense ? amt / sum.expense : 0} color={cat?.color} /></View>}
            right={<View style={{ alignItems: 'flex-end' }}><T v="num">{peso(amt, { cents: false })}</T><T v="small">{Math.round((amt / sum.expense) * 100)}%</T></View>} />;
        })}</List> : <Empty icon="chart-donut" title="No spending this month" />}
      </Section>
    </Screen>
  );
}
