import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useData } from '../../data/DataContext';
import { useTheme } from '../../theme';
import { Bar, Button, Card, Chip, ErrorText, Field, Footer, Screen, Segmented, Select, T, Toggle, close } from '../../components/ui';
import { useCategoryOptions } from '../../components/domain';
import { remove, upsert } from '../../db/repo';
import { budgetStatus, periodRange, type Period } from '../../lib/ledger';
import { dayLabel, inputValue, nowMs, peso, toCentavos, todayISO, uid } from '../../lib/money';

const PERIODS: [Period, string][] = [['daily', 'Daily'], ['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly'], ['yearly', 'Yearly']];

export default function BudgetScreen() {
  const { id, kind: kindParam } = useLocalSearchParams<{ id: string; kind?: string }>();
  const { c } = useTheme();
  const { data, act, cats, rtx } = useData();
  const b = data.budgets.find(x => x.id === id);
  const [kind, setKind] = useState<'expense' | 'income'>((b?.kind ?? kindParam) === 'income' ? 'income' : 'expense');
  const [categoryId, setCategoryId] = useState(b?.categoryId ?? '');
  const [name, setName] = useState(b?.name ?? '');
  const [period, setPeriod] = useState<Period>((b?.period as Period) ?? 'monthly');
  const [amount, setAmount] = useState(inputValue(b?.amount));
  const [rollover, setRollover] = useState(b?.rollover ?? false);
  const [error, setError] = useState<string | null>(null);
  const options = [{ value: '', label: kind === 'income' ? 'All income' : 'All spending', icon: 'all-inclusive' }, ...useCategoryOptions(kind, { allowNone: false })];
  const s = b ? budgetStatus(b, rtx, cats) : null;

  const save = () => {
    setError(null);
    const amt = toCentavos(amount);
    if (!(amt > 0)) return setError(kind === 'income' ? 'Enter a target, like 100k.' : 'Enter a limit, like 5000 or 5k.');
    const label = categoryId ? data.categories.find(x => x.id === categoryId)?.name : kind === 'income' ? 'All income' : 'All spending';
    const row = {
      id: b?.id ?? uid(), name: name.trim() || label || 'Budget', kind, categoryId: categoryId || null, period, amount: amt, rollover,
      // Rollover and bi-weekly cycles count from here; changing the period restarts them.
      startDate: b && b.period === period ? b.startDate : periodRange(period, todayISO()).start, createdAt: b?.createdAt ?? nowMs(),
    };
    if (act(db => upsert.budget(db, row), b ? 'Budget saved' : 'Budget created')) close();
  };

  return (
    <>
      <Screen title={b ? b.name : kind === 'income' ? 'New income target' : 'New budget'} back padBottom={30}>
        {s ? (
          <Card style={{ gap: 10, marginBottom: 18 }}>
            <T v="label">{dayLabel(s.start)} – {dayLabel(s.end)}</T>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <T v="numLg">{peso(s.spent)}</T><T v="muted">of {peso(s.available)}</T>
            </View>
            <Bar pct={s.pct} over={!s.isIncome && s.remaining < 0} color={s.isIncome ? c.income : undefined} height={10} />
            {s.carry ? <Chip label={`${peso(s.carry, { sign: true })} carried from earlier periods`} tone={s.carry > 0 ? 'good' : 'bad'} /> : null}
          </Card>
        ) : null}
        <View style={{ gap: 16 }}>
          {!b ? <Segmented value={kind} onChange={(v) => { setKind(v); setCategoryId(''); }} options={[['expense', 'Spending limit'], ['income', 'Income target']]} /> : null}
          <Select label="What it covers" value={categoryId} options={options} onChange={setCategoryId} />
          <T v="small">A parent category includes all its subcategories.</T>
          <View style={{ gap: 8 }}>
            <T v="label">Resets</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{PERIODS.map(([p, l]) => <Chip key={p} label={l} selected={period === p} onPress={() => setPeriod(p)} />)}</View>
          </View>
          <Field label={kind === 'income' ? 'Target' : 'Limit'} big value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
          <Field label="Name" value={name} onChangeText={setName} placeholder="Optional, defaults to the category" maxLength={40} />
          {kind === 'expense' ? <Toggle label="Roll over leftovers" hint="Unspent money adds to the next period; overspending takes from it." value={rollover} onChange={setRollover} /> : null}
          <ErrorText text={error} />
          {b ? <Button variant="danger" label="Delete budget" onPress={() => { if (act(db => remove.budget(db, b.id), 'Budget deleted')) close(); }} /> : null}
        </View>
      </Screen>
      <Footer><Button label={b ? 'Save changes' : 'Create'} icon="check" onPress={save} style={{ flex: 1 }} /></Footer>
    </>
  );
}
