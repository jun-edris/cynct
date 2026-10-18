import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useData } from '../../data/DataContext';
import { useTheme } from '../../theme';
import { Button, Card, DateField, ErrorText, Field, Footer, FormRow, IconButton, Note, Screen, Segmented, Select, T, TimeField, close } from '../../components/ui';
import { PhotoField, useAccountOptions } from '../../components/domain';
import { inputValue, nowMs, toCentavos, todayISO } from '../../lib/money';
import { convert, money, rateToText } from '../../lib/currency';
import { newTx, restore, softDelete, upsert } from '../../db/repo';
import type { Transaction } from '../../db/schema';

type Side = 'mine' | 'outside';

export default function TransferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { data, act, curOf, rates } = useData();
  const t = data.transactions.find(x => x.id === id);
  const isNew = !t;
  const [from, setFrom] = useState<Side>(t?.type === 'ext_in' ? 'outside' : 'mine');
  const [to, setTo] = useState<Side>(t?.type === 'ext_out' ? 'outside' : 'mine');
  const firstAcc = data.accounts.find(a => !a.archived)?.id ?? '';
  const [fromAcc, setFromAcc] = useState(t?.type !== 'ext_in' ? t?.accountId ?? firstAcc : firstAcc);
  const [toAcc, setToAcc] = useState(t?.type === 'transfer' ? t.toAccountId ?? '' : t?.type === 'ext_in' ? t.accountId ?? '' : data.accounts.find(a => !a.archived && a.id !== firstAcc)?.id ?? '');
  const [counterparty, setCounterparty] = useState(t?.counterparty ?? '');
  const [heldFor, setHeldFor] = useState(t?.heldFor ?? '');
  const [amount, setAmount] = useState(inputValue(t?.amount));
  const [fee, setFee] = useState(inputValue(t?.fee));
  const [received, setReceived] = useState(inputValue(t?.toAmount));
  const [date, setDate] = useState(t?.date ?? todayISO());
  const [time, setTime] = useState<string | null>(t?.time ?? null);
  const [note, setNote] = useState(t?.note ?? '');
  const [photo, setPhoto] = useState<string | null>(t?.photoUri ?? null);
  const [error, setError] = useState<string | null>(null);
  const fromOptions = useAccountOptions(t?.accountId);
  const toOptions = useAccountOptions(t?.toAccountId, a => a.id !== fromAcc || from === 'outside');

  const amt = toCentavos(amount || '0');
  const feeAmt = fee.trim() ? toCentavos(fee) : 0;
  const type = from === 'mine' && to === 'mine' ? 'transfer' : from === 'mine' ? 'ext_out' : to === 'mine' ? 'ext_in' : null;
  // Amounts are in the currency of the account the money leaves (or, for money received, the account it lands in).
  const cur = curOf(type === 'ext_in' ? toAcc : fromAcc);
  const toCur = curOf(toAcc);
  const cross = type === 'transfer' && cur !== toCur;
  const suggested = cross && amt > 0 ? convert(amt, cur, toCur, rates) : null;
  const recAmt = received.trim() ? toCentavos(received) : suggested ?? 0;
  const m = (v: number) => money(v, cur);

  const save = () => {
    setError(null);
    if (!type) return setError('One side has to be one of your accounts.');
    if (!(amt > 0)) return setError('Enter an amount greater than zero.');
    if (fee.trim() && !(feeAmt >= 0)) return setError('The fee must be a number.');
    if (type !== 'ext_in' && !fromAcc) return setError('Pick the account the money leaves.');
    if (type !== 'ext_out' && !toAcc) return setError('Pick the account the money goes into.');
    if (type === 'transfer' && fromAcc === toAcc) return setError('Pick two different accounts.');
    if (cross && !(recAmt > 0)) return setError(`Enter how much arrived in ${toCur}.`);
    if (type !== 'transfer' && !counterparty.trim()) return setError(type === 'ext_out' ? 'Who received the money?' : 'Who sent the money?');
    const row: Transaction = {
      ...(t ?? newTx({ type, amount: amt, date })), type, amount: amt, fee: type === 'ext_in' ? 0 : feeAmt,
      accountId: type === 'ext_in' ? toAcc : fromAcc, toAccountId: type === 'transfer' ? toAcc : null, toAmount: cross ? recAmt : null,
      counterparty: type === 'transfer' ? null : counterparty.trim(), heldFor: type === 'ext_in' ? heldFor.trim() || null : null,
      date, time, note: note.trim(), photoUri: photo, categoryId: null, updatedAt: nowMs(),
    };
    if (act(db => upsert.transaction(db, row), isNew ? `${type === 'transfer' ? 'Transfer' : type === 'ext_out' ? 'Sent' : 'Received'} ${m(amt)}` : 'Saved changes')) close();
  };

  const del = () => {
    if (!t) return;
    const tid = t.id;
    if (act(db => softDelete(db, [tid]), 'Moved to Recently deleted', { label: 'Undo', run: () => act(db => restore(db, [tid])) })) close();
  };

  return (
    <>
      <Screen title={isNew ? 'Transfer' : 'Edit transfer'} back right={!isNew ? <IconButton name="trash-can-outline" label="Delete" onPress={del} filled color={c.spend} /> : undefined} padBottom={30}>
        <Card style={{ gap: 14 }}>
          <View style={{ gap: 8 }}><T v="label">From</T>
            <Segmented value={from} onChange={setFrom} options={[['mine', 'My account', 'wallet-outline'], ['outside', 'Outside', 'account-arrow-right-outline']]} /></View>
          <View style={{ gap: 8 }}><T v="label">To</T>
            <Segmented value={to} onChange={setTo} options={[['mine', 'My account', 'wallet-outline'], ['outside', 'Outside', 'account-arrow-left-outline']]} /></View>
        </Card>

        <View style={{ marginTop: 14 }}>
          {type === 'transfer' ? <Note tone="good" icon="shield-check-outline">Moving money between your own accounts isn’t spending. Any fee is recorded under Fees.</Note>
            : type === 'ext_out' ? <Note tone="good" icon="shield-check-outline">Money sent to someone that isn’t spending, like a padala you’re passing along. The balance drops; reports ignore it except the fee.</Note>
            : type === 'ext_in' ? <Note tone="good" icon="shield-check-outline">Money received that isn’t your income, like cash you’re holding for someone. The balance rises; reports ignore it.</Note>
            : <Note tone="warn" icon="alert-outline">At least one side has to be one of your accounts.</Note>}
        </View>

        {type ? (
          <View style={{ gap: 16, marginTop: 16 }}>
            {type !== 'ext_in' ? <Select label="From account" value={fromAcc} options={fromOptions} onChange={setFromAcc} /> : null}
            {type === 'ext_in' ? <Field label="From who" value={counterparty} onChangeText={setCounterparty} placeholder="e.g. Client, Kuya, outside wallet" maxLength={50} /> : null}
            {type === 'ext_in' ? <Field label="Held for (optional)" value={heldFor} onChangeText={setHeldFor} placeholder="Who the money is really for" maxLength={50} /> : null}
            {type !== 'ext_out' ? <Select label="Into account" value={toAcc} options={toOptions} onChange={setToAcc} /> : null}
            {type === 'ext_out' ? <Field label="Sent to" value={counterparty} onChangeText={setCounterparty} placeholder="e.g. Mama, a friend, outside wallet" maxLength={50} /> : null}
            <FormRow>
              <Field label={`${type === 'ext_in' ? 'Amount received' : 'Amount sent'}${cur !== 'PHP' ? ` (${cur})` : ''}`} big value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
            </FormRow>
            {cross ? (
              <Field label={`Amount that arrived (${toCur})`} value={received} onChangeText={setReceived} keyboardType="decimal-pad"
                placeholder={suggested ? String(suggested / 100) : '0'}
                hint={suggested ? `Leave blank to use your rate${rates.get(cur) ? ` (1 ${cur} = ₱${rateToText(rates.get(cur)!)})` : ''}. Enter what actually landed to keep balances exact.` : `No ${cur}/${toCur} rate set. Enter what actually landed.`} />
            ) : null}
            {type !== 'ext_in' ? <Field label="Transfer fee (optional)" value={fee} onChangeText={setFee} keyboardType="decimal-pad" placeholder="e.g. 15 for InstaPay" /> : null}
            <FormRow>
              <DateField label="Date" value={date} onChange={(v) => v && setDate(v)} />
              <TimeField label="Time" value={time} onChange={setTime} />
            </FormRow>
            <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. Move to savings" maxLength={120} />
            <PhotoField value={photo} onChange={setPhoto} label="Screenshot or receipt (optional)" />
            <Card style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T v="medium" color={c.muted}>Amount</T><T v="num">{m(amt > 0 ? amt : 0)}</T></View>
              {type !== 'ext_in' ? <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T v="medium" color={c.muted}>Fee</T><T v="num">{m(feeAmt > 0 ? feeAmt : 0)}</T></View> : null}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T v="semi">{type === 'ext_in' ? 'Balance goes up by' : 'Total taken from account'}</T>
                <T v="numLg" style={{ fontSize: 19 }}>{m((amt > 0 ? amt : 0) + (type === 'ext_in' ? 0 : feeAmt > 0 ? feeAmt : 0))}</T>
              </View>
              {cross ? <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T v="medium" color={c.muted}>Arrives</T><T v="num">{money(recAmt > 0 ? recAmt : 0, toCur)}</T></View> : null}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T v="medium" color={c.muted}>Counts as spending</T><T v="semi" color={feeAmt > 0 && type !== 'ext_in' ? c.spend : c.income}>{feeAmt > 0 && type !== 'ext_in' ? `${m(feeAmt)} fee` : 'None'}</T>
              </View>
            </Card>
            <ErrorText text={error} />
          </View>
        ) : null}
      </Screen>
      {type ? <Footer><Button label={isNew ? (type === 'transfer' ? 'Record transfer' : type === 'ext_out' ? 'Record money sent' : 'Record money received') : 'Save changes'} icon="check" onPress={save} style={{ flex: 1 }} /></Footer> : null}
    </>
  );
}
