import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useData } from '../../data/DataContext';
import { usePayUpcoming } from '../../data/actions';
import { Button, Card, Chip, DateField, ErrorText, Field, Footer, FormRow, List, Row, Screen, Section, Segmented, Select, Sheet, T, Toggle, close } from '../../components/ui';
import { TxRow, useAccountOptions, useCategoryOptions } from '../../components/domain';
import { remove, skipRecurring, upsert } from '../../db/repo';
import { anchorFor, debtStatus, monthlyEquivalent, nextPayday } from '../../lib/ledger';
import { dayLabel, inputValue, nowMs, peso, toCentavos, todayISO, uid } from '../../lib/money';
import { FREQ_LABEL } from '../../lib/labels';
import { BASE, CURRENCIES, convert, currencyInfo, money, symbolOf, toBase } from '../../lib/currency';

type Kind = 'bill' | 'income' | 'transfer';
const FREQS = ['once', 'monthly', 'semimonthly', 'weekly', 'quarterly', 'yearly'];

export default function RecurringScreen() {
  const params = useLocalSearchParams<{ id: string; kind?: string; debtId?: string }>();
  const { data, act, rtx, curOf, fmt, rates } = useData();
  const pay = usePayUpcoming();
  const r = data.recurring.find(x => x.id === params.id);
  const presetDebt = params.debtId ? data.debts.find(d => d.id === params.debtId) : undefined;
  const defaultAccount = (data.settings.defaultAccountId as string) || data.accounts.find(a => !a.archived)?.id || '';
  const initialKind: Kind = (r?.kind as Kind) ?? (presetDebt ? (presetDebt.direction === 'owe' ? 'bill' : 'income') : params.kind === 'income' ? 'income' : params.kind === 'transfer' ? 'transfer' : 'bill');
  const [kind, setKind] = useState<Kind>(initialKind);
  const [name, setName] = useState(r?.name ?? (presetDebt ? (presetDebt.direction === 'owe' ? `Pay ${presetDebt.person}` : `${presetDebt.person} pays back`) : ''));
  const [amount, setAmount] = useState(inputValue(r?.amount));
  const [frequency, setFrequency] = useState(r?.frequency ?? 'monthly');
  const [accountId, setAccountId] = useState(r?.accountId ?? defaultAccount);
  const [toAccountId, setToAccountId] = useState(r?.toAccountId ?? '');
  const [categoryId, setCategoryId] = useState(r?.categoryId ?? '');
  const [debtId, setDebtId] = useState(r?.debtId ?? presetDebt?.id ?? '');
  const [nextDue, setNextDue] = useState(r?.nextDue ?? todayISO());
  const [endDate, setEndDate] = useState<string | null>(r?.endDate ?? null);
  const [active, setActive] = useState(r?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  // The plan is stored in its account's currency. You can type it in another one; it's converted when saved.
  const [pickedCur, setPickedCur] = useState<string | null>(null);
  const [curSheet, setCurSheet] = useState(false);
  const cur = curOf(accountId);
  const entryCur = pickedCur ?? cur;
  const foreign = entryCur !== cur;
  const typed = toCentavos(amount);
  const converted = foreign && typed > 0 ? convert(typed, entryCur, cur, rates) : null;
  const accName = data.accounts.find(a => a.id === accountId)?.name ?? 'the account';
  const curChoices = [...new Set([cur, 'PHP', 'USD', ...data.accounts.filter(a => !a.archived).map(a => a.currency), ...CURRENCIES.map(x => x.code)])];
  const pickAccount = (id: string) => {
    const next = curOf(id);
    // Keep the number meaning what you typed: $55 stays $55 even if the new account is in pesos.
    if (next === entryCur) setPickedCur(null);
    else if (!pickedCur && amount) setPickedCur(cur);
    setAccountId(id);
  };
  const accountOptions = useAccountOptions(r?.accountId);
  const toOptions = useAccountOptions(r?.toAccountId);
  const catOptions = useCategoryOptions(kind === 'income' ? 'income' : 'expense');
  const debtDir = kind === 'income' ? 'owed' : 'owe';
  const debtOptions = [{ value: '', label: 'Not linked' },
    ...data.debts.filter(d => d.direction === debtDir && (!d.closed || d.id === debtId)).map(d => ({ value: d.id, label: `${d.person} · ${peso(debtStatus(d, rtx).remaining, { cents: false })} left`, icon: 'hand-coin-outline' }))];
  const history = r ? data.transactions.filter(t => t.recurringId === r.id) : [];

  const save = () => {
    setError(null);
    if (!name.trim()) return setError('Give it a name.');
    if (!(typed > 0)) return setError('Enter an amount greater than zero.');
    if (foreign && !converted) return setError(`There’s no ${entryCur} rate saved to turn this into ${cur}. Add one in Currencies, or enter it in ${cur}.`);
    const amt = foreign ? converted! : typed;
    if (!accountId) return setError('Pick an account.');
    if (kind === 'transfer' && (!toAccountId || toAccountId === accountId)) return setError('Pick two different accounts.');
    if (endDate && endDate < nextDue) return setError('The end date is before the next due date.');
    const row = {
      id: r?.id ?? uid(), name: name.trim(), kind, amount: amt, accountId, toAccountId: kind === 'transfer' ? toAccountId : null,
      categoryId: kind === 'transfer' || debtId ? null : categoryId || null, frequency, nextDue, anchorDay: anchorFor(frequency, nextDue), endDate: frequency === 'once' ? null : endDate,
      debtId: kind === 'transfer' ? null : debtId || null, active, createdAt: r?.createdAt ?? nowMs(),
    };
    if (act(db => upsert.recurring(db, row), r ? 'Saved' : 'Planned')) close();
  };

  const verb = r?.kind === 'income' ? 'Mark received' : r?.kind === 'transfer' ? 'Mark done' : 'Mark paid';

  return (
    <>
      <Screen title={r ? r.name : 'Plan a payment'} back padBottom={30}>
        {r && r.active ? (
          <Card style={{ gap: 10, marginBottom: 16 }}>
            <T v="label">Next · {dayLabel(r.nextDue)}</T>
            <T v="numLg">{fmt(r.amount, r.accountId)}</T>
            {curOf(r.accountId) !== BASE ? <T v="small">{`About ${peso(toBase(r.amount, curOf(r.accountId), rates))} at today’s rate.`}</T> : null}
            {r.frequency !== 'once' ? <T v="small">About {fmt(monthlyEquivalent(r.amount, r.frequency), r.accountId, { cents: false })} a month.</T> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button small icon="check" label={verb} style={{ flex: 1 }} onPress={() => { pay({ source: 'recurring', id: r.id }); close(); }} />
              {r.frequency !== 'once' ? <Button small variant="secondary" label="Skip this one" style={{ flex: 1 }} onPress={() => { act(db => skipRecurring(db, r), 'Skipped to the next date'); close(); }} /> : null}
            </View>
          </Card>
        ) : null}
        <View style={{ gap: 16 }}>
          <Segmented value={kind} onChange={(v) => { setKind(v); setCategoryId(''); setDebtId(''); }} options={[['bill', 'Expense'], ['income', 'Income'], ['transfer', 'Transfer']]} />
          <Field label="Name" value={name} onChangeText={setName} placeholder={kind === 'income' ? 'e.g. Salary' : kind === 'transfer' ? 'e.g. Save to house fund' : 'e.g. Internet'} maxLength={40} />
          <View style={{ gap: 8 }}>
            <Field label="Amount" big value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" prefix={symbolOf(entryCur).trim()} />
            <View style={{ flexDirection: 'row' }}>
              <Chip icon="currency-usd" label={`${entryCur} · ${currencyInfo(entryCur).name}`} selected={foreign} onPress={() => setCurSheet(true)} />
            </View>
            {foreign ? <T v="small">{converted ? `Saved as ${money(converted, cur)} in ${accName} (${cur}), at today’s rate.` : `No ${entryCur} rate saved yet.`}</T> : null}
          </View>
          <View style={{ gap: 8 }}>
            <T v="label">Repeats</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {FREQS.map(f => <Chip key={f} label={FREQ_LABEL[f]} selected={frequency === f} onPress={() => { setFrequency(f); if (f === 'semimonthly' && !r) setNextDue(nextPayday(todayISO())); }} />)}
            </View>
          </View>
          <FormRow>
            <View style={{ flex: 1 }}><DateField label={frequency === 'once' ? 'Date' : 'Next due'} value={nextDue} onChange={(v) => v && setNextDue(v)} /></View>
            {frequency !== 'once' ? <View style={{ flex: 1 }}><DateField label="Ends" value={endDate} onChange={setEndDate} allowClear placeholder="Never" /></View> : null}
          </FormRow>
          <Select label={kind === 'income' ? 'Paid into' : kind === 'transfer' ? 'From' : 'Paid from'} value={accountId} options={accountOptions} onChange={pickAccount} />
          {kind === 'transfer' ? <Select label="To" value={toAccountId} options={toOptions} onChange={setToAccountId} /> : null}
          {kind !== 'transfer' ? <Select label={kind === 'income' ? 'Collects a loan' : 'Pays off a debt'} value={debtId} options={debtOptions} onChange={setDebtId} /> : null}
          {kind !== 'transfer' && !debtId ? <Select label="Category" value={categoryId} options={catOptions} onChange={setCategoryId} /> : null}
          {debtId ? <T v="small">Marking this paid records a payment on that debt instead of an expense.</T> : null}
          {r ? <Toggle label="Active" hint="Paused items stay listed but don’t show in Coming up or the forecast." value={active} onChange={setActive} /> : null}
          <T v="small">Nothing is recorded automatically. Tap “{kind === 'income' ? 'Mark received' : 'Mark paid'}” when the money actually moves.</T>
          <ErrorText text={error} />
          {r ? <Button variant="danger" label="Delete plan" onPress={() => { if (act(db => remove.recurring(db, r.id), 'Deleted. Past payments are kept.')) close(); }} /> : null}
        </View>
        {history.length ? <Section title="Recorded"><List>{history.slice(0, 24).map(t => <TxRow key={t.id} t={t} showDate />)}</List></Section> : null}
      </Screen>
      <Sheet visible={curSheet} onClose={() => setCurSheet(false)} title="Amount in">
        <View style={{ gap: 2 }}>
          {curChoices.map(code => (
            <Row key={code} title={`${code} · ${currencyInfo(code).name}`} sub={code === cur ? `${accName}’s currency` : undefined} selected={code === entryCur}
              left={<View style={{ width: 40, alignItems: 'center' }}><T v="h3">{symbolOf(code).trim()}</T></View>}
              onPress={() => { setPickedCur(code === cur ? null : code); setCurSheet(false); }} />
          ))}
        </View>
      </Sheet>
      <Footer><Button label={r ? 'Save changes' : 'Save plan'} icon="check" onPress={save} style={{ flex: 1 }} /></Footer>
    </>
  );
}
