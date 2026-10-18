import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../../theme';
import { Button, Card, Field, FormRow, Screen, Segmented, StatTile, T } from '../../components/ui';
import { monthsToReach } from '../../lib/finance';
import { addMonths, compactPeso, dayLabel, futureValue, peso, requiredMonthly, toCentavos, todayISO } from '../../lib/money';

type Mode = 'need' | 'reach';

export default function SavingsTool() {
  const { c } = useTheme();
  const [mode, setMode] = useState<Mode>('need');
  const [target, setTarget] = useState('2800000');
  const [saved, setSaved] = useState('0');
  const [months, setMonths] = useState('36');
  const [monthly, setMonthly] = useState('70000');
  const [rate, setRate] = useState('4');
  const T0 = toCentavos(target || '0'), S = toCentavos(saved || '0') || 0, n = parseInt(months, 10), M = toCentavos(monthly || '0') || 0;
  const r = (Number(rate) || 0) / 100;

  const need = mode === 'need' && T0 > 0 && n > 0 ? requiredMonthly(T0, S, n, r) : null;
  const reachIn = mode === 'reach' && T0 > 0 ? monthsToReach(T0, S, M, r) : null;
  const projected = mode === 'need' && need !== null ? Math.round(S * Math.pow(1 + r / 12, n)) + futureValue(need, n, r) : null;

  return (
    <Screen title="Savings calculator" subtitle="How much to save each month, or how long it will take." back>
      <Segmented value={mode} onChange={setMode} options={[['need', 'Monthly needed'], ['reach', 'Time to reach']]} />
      <View style={{ gap: 14, marginTop: 16 }}>
        <Field label="Target" big value={target} onChangeText={setTarget} keyboardType="decimal-pad" />
        <FormRow>
          <View style={{ flex: 1 }}><Field label="Saved so far" value={saved} onChangeText={setSaved} keyboardType="decimal-pad" /></View>
          <View style={{ flex: 1 }}><Field label="Interest % a year" value={rate} onChangeText={setRate} keyboardType="decimal-pad" hint="Digital banks pay about 3–5%" /></View>
        </FormRow>
        {mode === 'need'
          ? <Field label="Months" value={months} onChangeText={setMonths} keyboardType="number-pad" />
          : <Field label="Saving each month" value={monthly} onChangeText={setMonthly} keyboardType="decimal-pad" />}
      </View>

      <Card style={{ marginTop: 16, gap: 4 }}>
        {mode === 'need' ? (
          <>
            <T v="label">Save each month</T>
            <T v="display">{need !== null ? peso(need, { cents: false }) : '—'}</T>
            {need !== null ? <T v="small">{`For ${n} months, until ${dayLabel(addMonths(todayISO(), n))}.`}</T> : null}
          </>
        ) : (
          <>
            <T v="label">You’ll get there in</T>
            <T v="display">{reachIn === null ? 'Never' : reachIn === 0 ? 'Already there' : `${reachIn} months`}</T>
            {reachIn ? <T v="small">{`Around ${dayLabel(addMonths(todayISO(), reachIn))}.`}</T> : reachIn === null ? <T v="small" color={c.warn}>Add a monthly amount.</T> : null}
          </>
        )}
      </Card>
      {mode === 'need' && need !== null ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <StatTile label="You put in" value={compactPeso(S + need * n)} />
          <StatTile label="Interest earns" value={compactPeso(Math.max(0, (projected ?? 0) - S - need * n))} color={c.income} />
        </View>
      ) : null}
      <Button variant="secondary" icon="flag-plus-outline" label="Make it a goal" style={{ marginTop: 16 }} onPress={() => router.push('/goal-edit/new')} />
    </Screen>
  );
}
