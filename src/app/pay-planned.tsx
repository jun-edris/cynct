// Marking a planned payment done: confirm the real amount and date first, since bills and pay
// rarely land on the exact planned figure. Money in gets Senti's drop-in afterwards.
import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useData } from '../data/DataContext';
import { Button, DateField, Empty, ErrorText, Field, Screen, T, close } from '../components/ui';
import { GradButton } from '../components/k';
import { payRecurring, undoRecurringPayment } from '../db/repo';
import { dayLabel, inputValue, toCentavos, todayISO } from '../lib/money';
import { money, symbolOf } from '../lib/currency';

export default function PayPlanned() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, act, curOf } = useData();
  const r = data.recurring.find(x => x.id === id);
  const [amount, setAmount] = useState(r ? inputValue(r.amount) : '');
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  if (!r) return <Screen title="Planned payment" back><Empty title="This plan no longer exists" /></Screen>;

  const cur = curOf(r.accountId);
  const incoming = r.kind === 'income';
  const amt = toCentavos(amount || '0') || 0;
  const diff = amt - r.amount;

  const save = () => {
    setError(null);
    if (!(amt > 0)) return setError('Enter the amount.');
    const debt = r.debtId ? data.debts.find(d => d.id === r.debtId) ?? null : null;
    let txId = '';
    const ok = act(db => { txId = payRecurring(db, r, date, amt, debt).id; },
      `${r.name}: ${money(amt, cur)} ${incoming ? 'received' : 'paid'}`, { label: 'Undo', run: () => act(db => undoRecurringPayment(db, r, txId)) });
    if (!ok) return;
    if (incoming) {
      const acc = data.accounts.find(a => a.id === r.accountId)?.name;
      router.replace({ pathname: '/saved', params: { kind: 'in', tx: txId, ask: '1', amount: `+${money(amt, cur, { cents: 'auto' })}`,
        title: [r.name, acc].filter(Boolean).join(' · '), sub: date === todayISO() ? 'today' : dayLabel(date) } });
    } else close();
  };

  return (
    <Screen title={incoming ? `Received ${r.name}?` : `Paid ${r.name}?`} subtitle={`Planned ${money(r.amount, cur)} on ${dayLabel(r.nextDue)}`} back padBottom={40}>
      <View style={{ gap: 16 }}>
        <Field label={incoming ? 'Amount that came in' : 'Amount you paid'} big value={amount} onChangeText={setAmount} keyboardType="decimal-pad" prefix={symbolOf(cur).trim()}
          hint={amt > 0 && diff !== 0 ? `${money(Math.abs(diff), cur)} ${diff > 0 ? 'more' : 'less'} than planned. Only this time; the plan stays at ${money(r.amount, cur)}.` : 'Change it if the real amount was different.'} />
        <DateField label="Date" value={date} onChange={(v) => v && setDate(v)} />
        <ErrorText text={error} />
        <GradButton label={`${incoming ? 'Record' : 'Record payment of'} ${amt > 0 ? money(amt, cur) : ''}`.trim()} onPress={save} />
        <Button variant="ghost" label="Edit the plan instead" onPress={() => router.replace(`/recurring/${r.id}`)} />
        <T v="small">{`Next due moves on from ${dayLabel(r.nextDue)} after this.`}</T>
      </View>
    </Screen>
  );
}
