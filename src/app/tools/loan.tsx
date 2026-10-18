import React, { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme';
import { Card, Field, FormRow, List, Note, Row, Screen, Section, Segmented, StatTile, T } from '../../components/ui';
import { addOn, amortized } from '../../lib/finance';
import { compactPeso, peso, toCentavos } from '../../lib/money';

type Mode = 'reducing' | 'addon';

export default function LoanTool() {
  const { c } = useTheme();
  const [mode, setMode] = useState<Mode>('reducing');
  const [amount, setAmount] = useState('100000');
  const [rate, setRate] = useState('12');
  const [months, setMonths] = useState('12');
  const p = toCentavos(amount || '0'), r = Number(rate) / 100, n = parseInt(months, 10);
  const ok = p > 0 && r >= 0 && n > 0 && n <= 600;
  const res = ok ? (mode === 'reducing' ? amortized(p, r, n) : addOn(p, r, n)) : null;

  return (
    <Screen title="Loan calculator" subtitle="See the monthly payment and what a loan really costs." back>
      <Segmented value={mode} onChange={setMode} options={[['reducing', 'Bank / reducing'], ['addon', 'Add-on rate']]} />
      <View style={{ gap: 14, marginTop: 16 }}>
        <Field label="Loan amount" big value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <FormRow>
          <View style={{ flex: 1 }}><Field label={mode === 'reducing' ? 'Interest % a year' : 'Add-on % a month'} value={rate} onChangeText={setRate} keyboardType="decimal-pad" /></View>
          <View style={{ flex: 1 }}><Field label="Months" value={months} onChangeText={setMonths} keyboardType="number-pad" /></View>
        </FormRow>
      </View>
      {res ? (
        <>
          <Card style={{ marginTop: 16, gap: 4 }}>
            <T v="label">Monthly payment</T>
            <T v="display">{peso(res.monthly)}</T>
          </Card>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <StatTile label="Total interest" value={compactPeso(res.totalInterest)} color={c.spend} />
            <StatTile label="Total paid" value={compactPeso(res.totalPaid)} />
          </View>
          {mode === 'addon' ? (
            <View style={{ marginTop: 12 }}>
              <Note tone="warn" icon="alert-outline">{`A ${rate}% monthly add-on rate costs about ${(res.effectiveAnnual * 100).toFixed(1)}% a year on a reducing balance, because you pay interest on money you’ve already paid back.`}</Note>
            </View>
          ) : null}
          <Section title="Schedule" aside={n > 24 ? 'first 24 months' : undefined}>
            <List>{res.schedule.slice(0, 24).map(s => (
              <Row key={s.month} title={`Month ${s.month}`} sub={`Interest ${peso(s.interest)} · principal ${peso(s.principal)}`}
                right={<View style={{ alignItems: 'flex-end' }}><T v="num">{peso(s.payment)}</T><T v="small">{peso(s.balance, { cents: false })} left</T></View>} />
            ))}</List>
          </Section>
        </>
      ) : <T v="small" style={{ marginTop: 14 }}>Enter an amount, a rate and 1 to 600 months.</T>}
    </Screen>
  );
}
