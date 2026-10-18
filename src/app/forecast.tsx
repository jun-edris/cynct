import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Line, Path, Stop, Circle } from 'react-native-svg';
import { useData } from '../data/DataContext';
import { usePayUpcoming, isPayable } from '../data/actions';
import { useTheme } from '../theme';
import { Card, Chip, Empty, Field, List, Screen, Section, StatTile, T } from '../components/ui';
import { UpcomingRow } from '../components/domain';
import { forecast } from '../lib/ledger';
import { compactPeso, dayLabel, peso, todayISO } from '../lib/money';

const RANGES = [7, 30, 90];

function Curve({ series, color, danger, line, faint }: { series: { date: string; balance: number }[]; color: string; danger: string; line: string; faint: string }) {
  const [w, setW] = useState(0);
  const h = 150, pad = 8;
  const vals = series.map(p => p.balance);
  const min = Math.min(0, ...vals), max = Math.max(...vals, 1);
  const x = (i: number) => pad + (i / Math.max(1, series.length - 1)) * (w - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / (max - min || 1)) * (h - pad * 2);
  // Step line: balances change at day boundaries.
  let d = '';
  series.forEach((p, i) => { d += i === 0 ? `M${x(i)},${y(p.balance)}` : `H${x(i)}V${y(p.balance)}`; });
  const area = `${d}V${h}H${x(0)}Z`;
  const low = series.reduce((m, p, i) => (p.balance < series[m].balance ? i : m), 0);
  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{ height: h }}>
      {w > 0 ? (
        <Svg width={w} height={h}>
          <Defs>
            <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.35} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {min < 0 ? <Line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke={danger} strokeDasharray="4 4" strokeWidth={1} /> : <Line x1={0} x2={w} y1={h - 1} y2={h - 1} stroke={line} strokeWidth={1} />}
          <Path d={area} fill="url(#fill)" />
          <Path d={d} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
          <Circle cx={x(low)} cy={y(series[low].balance)} r={5} fill={series[low].balance < 0 ? danger : faint} />
        </Svg>
      ) : null}
    </View>
  );
}

export default function Forecast() {
  const { c } = useTheme();
  const { data, baseBalances, rtx, plannedBase } = useData();
  const pay = usePayUpcoming();
  const [days, setDays] = useState(30);
  const [custom, setCustom] = useState('');
  const today = todayISO();
  const f = useMemo(() => forecast({
    accounts: data.accounts, balances: baseBalances, txs: rtx, recurring: plannedBase.recurring,
    installments: plannedBase.installments.filter(i => i.paidCount < i.months), debts: data.debts,
  }, today, days), [data, baseBalances, rtx, plannedBase, today, days]);
  const net = f.actualIn + f.expectedIn - f.actualOut - f.expectedOut;

  return (
    <Screen title="Forecast" subtitle="Where your spendable cash is heading, from what you’ve planned and logged." back>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {RANGES.map(r => <Chip key={r} label={`${r} days`} selected={days === r && !custom} onPress={() => { setCustom(''); setDays(r); }} />)}
        <View style={{ width: 110 }}>
          <Field label="Custom days" value={custom} keyboardType="number-pad" placeholder="e.g. 45"
            onChangeText={(v) => { setCustom(v); const n = parseInt(v, 10); if (n > 0 && n <= 365) setDays(n); }} />
        </View>
      </View>

      <Card style={{ marginTop: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View><T v="label">Now</T><T v="num">{peso(f.start, { cents: false })}</T></View>
          <View style={{ alignItems: 'flex-end' }}><T v="label">{dayLabel(f.series[f.series.length - 1].date)}</T>
            <T v="num" color={f.end < 0 ? c.spend : c.ink}>{peso(f.end, { cents: false })}</T></View>
        </View>
        <Curve series={f.series} color={c.mango} danger={c.spend} line={c.line} faint={c.ink} />
        <T v="small" color={f.lowest.balance < 0 ? c.spend : undefined}>
          Lowest point {peso(f.lowest.balance, { cents: false })}, {dayLabel(f.lowest.date).toLowerCase() === 'today' ? 'today' : dayLabel(f.lowest.date)}.{f.lowest.balance < 0 ? ' You’d run short — move a payment or top up before then.' : ''}
        </T>
        <T v="small">Starts from your cash, bank and e-wallet balances. Cards and loans count only when their payments are due.</T>
      </Card>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <StatTile label="Expected in" value={compactPeso(f.expectedIn)} color={c.income} sub={f.actualIn ? `+${compactPeso(f.actualIn)} logged` : 'from plans'} />
        <StatTile label="Expected out" value={compactPeso(f.expectedOut)} color={c.spend} sub={f.actualOut ? `+${compactPeso(f.actualOut)} logged` : 'from plans'} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <StatTile label={`Net over ${days} days`} value={`${net >= 0 ? '+' : '−'}${compactPeso(Math.abs(net))}`} color={net >= 0 ? c.income : c.spend} />
        <StatTile label="Items" value={String(f.items.length)} />
      </View>

      <Section title="Timeline">
        {f.items.length ? <List>{f.items.map(i => <UpcomingRow key={i.key} item={i} onPay={isPayable(i, data) ? () => pay(i) : undefined} />)}</List>
          : <Empty icon="calendar-blank-outline" title="Nothing in this window" text="Plan your salary and bills to see where your cash is heading." />}
      </Section>
    </Screen>
  );
}
