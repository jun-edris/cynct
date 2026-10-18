import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useData } from '../../data/DataContext';
import { usePayUpcoming } from '../../data/actions';
import { Bar, Button, Card, DateField, ErrorText, Field, Footer, FormRow, List, Screen, Section, Select, T, close } from '../../components/ui';
import { TxRow, useAccountOptions, useCategoryOptions } from '../../components/domain';
import { remove, upsert } from '../../db/repo';
import { installmentStatus } from '../../lib/ledger';
import { dayLabel, inputValue, nowMs, peso, toCentavos, todayISO, uid } from '../../lib/money';

export default function InstallmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, act } = useData();
  const pay = usePayUpcoming();
  const inst = data.installments.find(x => x.id === id);
  const [name, setName] = useState(inst?.name ?? '');
  const [monthly, setMonthly] = useState(inputValue(inst?.monthlyAmount));
  const [months, setMonths] = useState(inst ? String(inst.months) : '12');
  const [paid, setPaid] = useState(inst ? String(inst.paidCount) : '0');
  const [accountId, setAccountId] = useState(inst?.accountId ?? data.accounts.find(a => a.type === 'credit' && !a.archived)?.id ?? data.accounts.find(a => !a.archived)?.id ?? '');
  const [categoryId, setCategoryId] = useState(inst?.categoryId ?? '');
  const [nextDue, setNextDue] = useState(inst?.nextDue ?? todayISO());
  const [note, setNote] = useState(inst?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const accountOptions = useAccountOptions(inst?.accountId);
  const catOptions = useCategoryOptions('expense');
  const payments = inst ? data.transactions.filter(t => t.installmentId === inst.id) : [];
  const status = inst ? installmentStatus(inst) : null;

  const m = parseInt(months, 10), p = parseInt(paid, 10), amt = toCentavos(monthly);
  const totalPreview = amt > 0 && m > 0 ? peso(amt * m) : null;

  const save = () => {
    setError(null);
    if (!name.trim()) return setError('Give it a name, like “Phone 0% 12 months”.');
    if (!(amt > 0)) return setError('Enter the monthly amount.');
    if (!(m > 0 && m <= 120)) return setError('Months must be between 1 and 120.');
    if (!(p >= 0 && p <= m)) return setError('Months already paid can’t be more than the total.');
    if (!accountId) return setError('Pick the account it’s charged to.');
    const row = { id: inst?.id ?? uid(), name: name.trim(), monthlyAmount: amt, months: m, paidCount: p, accountId, categoryId: categoryId || null,
      nextDue, note: note.trim(), createdAt: inst?.createdAt ?? nowMs() };
    if (act(db => upsert.installment(db, row), inst ? 'Saved' : 'Installment added')) close();
  };

  return (
    <>
      <Screen title={inst ? inst.name : 'New installment'} back padBottom={30}>
        {inst && status ? (
          <Card style={{ gap: 10, marginBottom: 16 }}>
            <T v="label">{status.done ? 'Fully paid' : `${status.left} payments left`}</T>
            <T v="numLg">{peso(status.remaining)}</T>
            <Bar pct={status.pct} color="#8B6CFF" height={10} />
            <T v="small">{inst.paidCount} of {inst.months} paid · {peso(status.total)} total</T>
            {!status.done ? <Button small icon="check" label={`Pay ${inst.paidCount + 1} of ${inst.months} now`}
              onPress={() => { pay({ source: 'installment', id: inst.id }); close(); }} /> : null}
          </Card>
        ) : null}
        <View style={{ gap: 16 }}>
          <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Laptop 0% 12 months" maxLength={50} />
          <FormRow>
            <View style={{ flex: 1 }}><Field label="Monthly amount" value={monthly} onChangeText={setMonthly} keyboardType="decimal-pad" placeholder="0" /></View>
            <View style={{ flex: 1 }}><Field label="Months" value={months} onChangeText={setMonths} keyboardType="number-pad" /></View>
          </FormRow>
          {totalPreview ? <T v="small">Total: {totalPreview}</T> : null}
          <FormRow>
            <View style={{ flex: 1 }}><Field label="Already paid" value={paid} onChangeText={setPaid} keyboardType="number-pad" hint="Months paid before tracking" /></View>
            <View style={{ flex: 1 }}><DateField label="Next payment" value={nextDue} onChange={(v) => v && setNextDue(v)} /></View>
          </FormRow>
          <Select label="Charged to" value={accountId} options={accountOptions} onChange={setAccountId} />
          <Select label="Category" value={categoryId} options={catOptions} onChange={setCategoryId} />
          <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" maxLength={120} />
          <ErrorText text={error} />
          {inst ? <Button variant="danger" label="Delete installment" onPress={() => { if (act(db => remove.installment(db, inst.id), 'Deleted. Past payments are kept.')) close(); }} /> : null}
        </View>
        {payments.length ? <Section title="Payments"><List>{payments.map(t => <TxRow key={t.id} t={t} showDate />)}</List></Section>
          : inst ? <T v="small" style={{ marginTop: 16 }}>No payments recorded yet. Next one is {dayLabel(inst.nextDue)}.</T> : null}
      </Screen>
      <Footer><Button label={inst ? 'Save changes' : 'Add installment'} icon="check" onPress={save} style={{ flex: 1 }} /></Footer>
    </>
  );
}
