import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useData } from '../../data/DataContext';
import { useTheme } from '../../theme';
import { Bar, Button, Card, Chip, Field, List, Row, Screen, Section, StatTile, T } from '../../components/ui';
import { emergencyPlan, monthlyCosts, perMonthToClose } from '../../lib/emergency';
import { goalFund } from '../../lib/ledger';
import { addMonths, dayLabel, inputValue, peso, toCentavos, todayISO } from '../../lib/money';

const COVER = [3, 6, 9, 12];
const CLOSE = [6, 12, 24];

export default function EmergencyTool() {
  const { c } = useTheme();
  const { data, rtx, plannedBase } = useData();
  const today = todayISO();
  const costs = monthlyCosts(plannedBase.recurring, plannedBase.installments, rtx, today);
  const goals = data.goals.filter(g => !g.archived).map(g => ({ g, fund: goalFund(g, rtx) }));
  const efGoal = goals.find(x => /emergenc/i.test(x.g.name));

  // Empty means "use what the app worked out"; typing overrides it.
  const [monthlyText, setMonthlyText] = useState('');
  const [savedText, setSavedText] = useState(efGoal ? inputValue(efGoal.fund) : '');
  const [months, setMonths] = useState(6);
  const [closeIn, setCloseIn] = useState(12);

  const monthly = monthlyText ? toCentavos(monthlyText) || 0 : costs.total;
  const saved = toCentavos(savedText || '0') || 0;
  const plan = emergencyPlan(monthly, months, saved);
  const perMonth = perMonthToClose(plan.gap, closeIn);
  const p0 = (n: number) => peso(n, { cents: false });

  const makeGoal = () => {
    if (efGoal) return router.push(`/goal-edit/${efGoal.g.id}`);
    router.push({ pathname: '/goal-edit/[id]', params: { id: 'new', name: 'Emergency fund', target: String(plan.target), monthly: String(perMonth), months: String(closeIn) } });
  };

  return (
    <Screen title="Emergency fund" subtitle="Money to live on if your income stopped tomorrow." back>
      <Card style={{ gap: 6 }}>
        <T v="label">{`${months} months of costs`}</T>
        <T v="display">{monthly > 0 ? p0(plan.target) : '—'}</T>
        {monthly > 0 ? (
          <>
            <Bar pct={plan.pct} color={plan.gap ? c.mango : c.income} height={10} />
            <T v="small">{plan.gap
              ? saved > 0 ? `You have ${p0(saved)}, enough for about ${plan.covers} ${plan.covers === 1 ? 'month' : 'months'}. ${p0(plan.gap)} to go.` : `Nothing set aside yet. ${p0(plan.gap)} to go.`
              : `Fully funded. What you have covers about ${plan.covers} months.`}</T>
          </>
        ) : <T v="small" color={c.warn}>Enter what a month costs you below.</T>}
      </Card>

      <View style={{ gap: 14, marginTop: 16 }}>
        <View style={{ gap: 8 }}>
          <T v="label">Months to cover</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {COVER.map(m => <Chip key={m} label={`${m} months`} selected={months === m} onPress={() => setMonths(m)} />)}
          </View>
          <T v="small">Three is the usual floor with a steady salary. Go for six or more if your income is freelance or irregular, or if others depend on you.</T>
        </View>

        <Field label="A month of costs" big value={monthlyText} onChangeText={setMonthlyText} keyboardType="decimal-pad" prefix="₱"
          placeholder={costs.total ? Math.round(costs.total / 100).toLocaleString('en-US') : '0'}
          hint={monthlyText ? 'Your own figure. Clear it to use your spending.' : costs.total ? 'Worked out from your spending. Type a lower figure if you’d cut back in an emergency.' : 'No spending recorded yet. Type a figure.'} />

        <Field label="Already set aside" value={savedText} onChangeText={setSavedText} keyboardType="decimal-pad" prefix="₱" placeholder="0" />
        {goals.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {goals.map(({ g, fund }) => <Chip key={g.id} icon="flag-outline" label={`${g.name} · ${p0(fund)}`} onPress={() => setSavedText(inputValue(fund))} />)}
          </View>
        ) : null}
      </View>

      {costs.total ? (
        <Section title="Where the monthly figure comes from">
          <List>
            <Row icon="calendar-sync" title="Planned bills" sub="Active bills, as a monthly amount" right={<T v="num">{p0(costs.bills)}</T>} />
            <Row icon="credit-card-clock-outline" title="Installments" sub="Ones still being paid" right={<T v="num">{p0(costs.installments)}</T>} />
            <Row icon="cart-outline" title="Day-to-day spending" sub="Your average over the last 90 days" right={<T v="num">{p0(costs.dayToDay)}</T>} />
          </List>
        </Section>
      ) : null}

      {plan.gap > 0 ? (
        <Section title="Close the gap">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {CLOSE.map(m => <Chip key={m} label={`In ${m} months`} selected={closeIn === m} onPress={() => setCloseIn(m)} />)}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <StatTile label="Save each month" value={p0(perMonth)} color={c.income} />
            <StatTile label="Done by" value={dayLabel(addMonths(today, closeIn))} />
          </View>
        </Section>
      ) : null}

      <Button variant="secondary" icon="flag-plus-outline" label={efGoal ? `Open ${efGoal.g.name}` : 'Make it a goal'} style={{ marginTop: 16 }} onPress={makeGoal} disabled={!efGoal && !plan.target} />
      <T v="small" style={{ marginTop: 10 }}>Keep it somewhere you can reach in a day without losing value, like a savings account or digital bank. Not stocks or crypto.</T>
    </Screen>
  );
}
