import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useData } from '../../data/DataContext';
import { Button, Chip, DateField, ErrorText, Field, Footer, FormRow, Screen, Segmented, Select, T, close } from '../../components/ui';
import { useAccountOptions } from '../../components/domain';
import { createDebt, upsert } from '../../db/repo';
import { inputValue, nowMs, toCentavos, todayISO, uid } from '../../lib/money';
import { PARTY_ICON, PARTY_LABEL } from '../../lib/labels';

type Dir = 'owe' | 'owed';

export default function DebtEdit() {
  const { id, dir } = useLocalSearchParams<{ id: string; dir?: string }>();
  const { data, act } = useData();
  const d = data.debts.find(x => x.id === id);
  const [direction, setDirection] = useState<Dir>((d?.direction ?? dir) === 'owed' ? 'owed' : 'owe');
  const [partyType, setPartyType] = useState(d?.partyType ?? 'person');
  const [person, setPerson] = useState(d?.person ?? '');
  const [principal, setPrincipal] = useState(inputValue(d?.principal));
  const [alreadyPaid, setAlreadyPaid] = useState(inputValue(d?.alreadyPaid));
  const [rate, setRate] = useState(d?.interestRate ? String(d.interestRate / 100) : '');
  const [startDate, setStartDate] = useState<string>(d?.startDate ?? todayISO());
  const [dueDate, setDueDate] = useState<string | null>(d?.dueDate ?? null);
  const [note, setNote] = useState(d?.note ?? '');
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const accountOptions = [{ value: '', label: 'Don’t move money (already happened)', icon: 'eye-off-outline' }, ...useAccountOptions()];
  const owe = direction === 'owe';

  const save = () => {
    setError(null);
    const amt = toCentavos(principal);
    const paid = toCentavos(alreadyPaid) || 0;
    const r = Number(rate || 0);
    if (!person.trim()) return setError(owe ? 'Who did you borrow from?' : 'Who did you lend to?');
    if (!(amt > 0)) return setError('Enter the amount.');
    if (paid > amt) return setError('Already paid can’t be more than the total.');
    if (!(r >= 0 && r < 100)) return setError('Interest must be between 0 and 100%.');
    const row = {
      id: d?.id ?? uid(), direction, partyType, person: person.trim(), principal: amt, alreadyPaid: paid, interestRate: Math.round(r * 100),
      startDate, dueDate, note: note.trim(), closed: d?.closed ?? paid >= amt, createdAt: d?.createdAt ?? nowMs(),
    };
    if (d) { if (act(db => upsert.debt(db, row), 'Saved')) close(); return; }
    if (act(db => createDebt(db, row, accountId || null, startDate), owe ? 'Debt added' : 'Added')) router.replace(`/debt/${row.id}`);
  };

  return (
    <>
      <Screen title={d ? 'Edit' : owe ? 'New debt' : 'New money owed to you'} back padBottom={30}>
        <View style={{ gap: 16 }}>
          {!d ? <Segmented value={direction} onChange={setDirection} options={[['owe', 'I borrowed', 'arrow-down'], ['owed', 'I lent', 'arrow-up']]} /> : null}
          <View style={{ gap: 8 }}>
            <T v="label">{owe ? 'Borrowed from' : 'Lent to'}</T>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {Object.keys(PARTY_LABEL).map(k => <Chip key={k} icon={PARTY_ICON[k]} label={PARTY_LABEL[k]} selected={partyType === k} onPress={() => setPartyType(k)} />)}
            </View>
          </View>
          <Field label="Name" value={person} onChangeText={setPerson} placeholder={partyType === 'person' ? 'e.g. Tito Ben' : 'e.g. BPI, Home Credit'} maxLength={50} />
          <Field label="Total amount" big value={principal} onChangeText={setPrincipal} keyboardType="decimal-pad" placeholder="0" />
          {!d ? <Select label={owe ? 'Money went into' : 'Money came out of'} value={accountId} options={accountOptions} onChange={setAccountId} /> : null}
          <FormRow>
            <View style={{ flex: 1 }}><Field label="Already paid" value={alreadyPaid} onChangeText={setAlreadyPaid} keyboardType="decimal-pad" placeholder="0" /></View>
            <View style={{ flex: 1 }}><Field label="Interest %" value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="0" /></View>
          </FormRow>
          <T v="small">“Already paid” is for payments made before you started tracking. It doesn’t touch any account.</T>
          <FormRow>
            <View style={{ flex: 1 }}><DateField label="Start date" value={startDate} onChange={(v) => v && setStartDate(v)} /></View>
            <View style={{ flex: 1 }}><DateField label="Due date" value={dueDate} onChange={setDueDate} allowClear /></View>
          </FormRow>
          <Field label="Notes" value={note} onChangeText={setNote} placeholder="Optional" multiline />
          <ErrorText text={error} />
        </View>
      </Screen>
      <Footer><Button label={d ? 'Save changes' : 'Add'} icon="check" onPress={save} style={{ flex: 1 }} /></Footer>
    </>
  );
}
