import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useData } from '../../data/DataContext';
import { useTheme } from '../../theme';
import { Bar, Block, Button, Card, Chip, DateField, Empty, ErrorText, Field, IconButton, List, Row, Screen, Section, Select, Sheet, StatTile, T } from '../../components/ui';
import { TxRow, useAccountOptions } from '../../components/domain';
import { addBorrowing, recordDebtPayment, remove, softDelete, upsert } from '../../db/repo';
import { debtStatus } from '../../lib/ledger';
import { compactPeso, dayLabel, peso, toCentavos, todayISO } from '../../lib/money';
import { FREQ_LABEL, PARTY_LABEL } from '../../lib/labels';

export default function DebtDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { data, act, rtx } = useData();
  const d = data.debts.find(x => x.id === id);
  const [sheet, setSheet] = useState<'pay' | 'borrow' | null>(null);
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState((data.settings.defaultAccountId as string) || '');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const accountOptions = [{ value: '', label: 'Not tracked in an account', icon: 'eye-off-outline' }, ...useAccountOptions()];
  if (!d) return <Screen title="Debt" back><Empty title="This record no longer exists" /></Screen>;

  const owe = d.direction === 'owe';
  const s = debtStatus(d, rtx);
  const history = data.transactions.filter(t => t.debtId === d.id);
  const plans = data.recurring.filter(r => r.debtId === d.id);
  const tone = owe ? c.spend : c.income;

  const openSheet = (k: 'pay' | 'borrow') => { setError(null); setAmount(''); setNote(''); setSheet(k); };

  const submit = () => {
    setError(null);
    const amt = toCentavos(amount);
    if (!(amt > 0)) return setError('Enter an amount.');
    const acct = accountId || null;
    let txId = '';
    if (sheet === 'pay') {
      if (amt > s.remaining) return setError(`That’s more than the ${peso(s.remaining)} left.`);
      const settles = amt === s.remaining;
      if (act(db => { txId = recordDebtPayment(db, d, acct, amt, date, settles).id; }, settles ? 'Settled in full' : `Recorded ${peso(amt)}`,
        { label: 'Undo', run: () => act(db => { softDelete(db, [txId]); if (settles) upsert.debt(db, { ...d, closed: false }); }) })) setSheet(null);
    } else {
      if (act(db => { txId = addBorrowing(db, d, amt, acct, date, note.trim()).id; }, `Added ${peso(amt)}`,
        { label: 'Undo', run: () => act(db => softDelete(db, [txId])) })) setSheet(null);
    }
  };

  return (
    <Screen title={d.person} subtitle={`${PARTY_LABEL[d.partyType] ?? 'Person'} · ${owe ? 'you borrowed' : 'you lent'}`} back right={<>
      <IconButton name="pencil-outline" label="Edit" filled onPress={() => router.push(`/debt-edit/${d.id}`)} />
      <IconButton name="trash-can-outline" label="Delete" filled color={c.spend} onPress={() => setConfirmDelete(true)} />
    </>}>
      <Block tone="navy">
        <T v="semi" color={c.navyMuted}>{d.closed ? 'Settled' : owe ? 'You still owe' : 'Still owed to you'}</T>
        <T v="display" color={c.navyText}>{peso(s.remaining)}</T>
        <View style={{ marginTop: 12 }}><Bar pct={s.pct} color={tone} track={c.navyLine} height={10} /></View>
        <T v="small" color={c.navyMuted} style={{ marginTop: 8 }}>{peso(s.paid)} of {peso(s.total)} {owe ? 'paid' : 'collected'} · {Math.round(s.pct * 100)}%</T>
      </Block>

      {!d.closed ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <Button icon="check" label={owe ? 'Pay back' : 'Collect'} onPress={() => openSheet('pay')} style={{ flex: 1 }} />
          <Button icon="plus" variant="secondary" label={owe ? 'Borrow more' : 'Lend more'} onPress={() => openSheet('borrow')} style={{ flex: 1 }} />
        </View>
      ) : (
        <Button icon="restore" variant="secondary" label="Reopen" style={{ marginTop: 14 }} onPress={() => act(db => upsert.debt(db, { ...d, closed: false }), 'Reopened')} />
      )}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <StatTile label="Original" value={compactPeso(d.principal)} sub={d.startDate ? `since ${dayLabel(d.startDate)}` : undefined} />
        <StatTile label={owe ? 'Borrowed later' : 'Lent later'} value={compactPeso(s.borrowed)} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <StatTile label="Due" value={d.dueDate ? dayLabel(d.dueDate) : 'No date'} color={d.dueDate && d.dueDate < todayISO() && !d.closed ? c.spend : undefined} />
        <StatTile label="Interest" value={d.interestRate ? `${d.interestRate / 100}%` : 'None'} sub={d.alreadyPaid ? `${compactPeso(d.alreadyPaid)} paid before tracking` : undefined} />
      </View>
      {d.note ? <Card style={{ marginTop: 10 }}><T v="muted">{d.note}</T></Card> : null}

      {plans.length ? (
        <Section title="Planned payments">
          <List>{plans.map(r => <Row key={r.id} icon="calendar-sync" iconColor={tone} title={r.name} sub={`${FREQ_LABEL[r.frequency]} · next ${dayLabel(r.nextDue)}`}
            right={<T v="num">{peso(r.amount, { cents: false })}</T>} onPress={() => router.push(`/recurring/${r.id}`)} chevron />)}</List>
        </Section>
      ) : !d.closed ? (
        <Chip icon="calendar-plus" label="Plan regular payments" onPress={() => router.push({ pathname: '/recurring/[id]', params: { id: 'new', debtId: d.id } })} />
      ) : null}

      <Section title="History">
        {history.length ? <List>{history.map(t => <TxRow key={t.id} t={t} showDate />)}</List>
          : <Empty icon="history" title="Nothing recorded yet" text="Payments and extra borrowing show here." />}
      </Section>

      <Sheet visible={!!sheet} onClose={() => setSheet(null)} title={sheet === 'pay' ? (owe ? `Pay ${d.person}` : `${d.person} paid you`) : (owe ? `Borrow more from ${d.person}` : `Lend more to ${d.person}`)}>
        <View style={{ gap: 14 }}>
          <Field label="Amount" big value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" autoFocus />
          {sheet === 'pay' ? <Chip label={`Full ${peso(s.remaining)}`} icon="check-all" onPress={() => setAmount(String(s.remaining / 100))} /> : null}
          <Select label={sheet === 'pay' ? (owe ? 'Paid from' : 'Received in') : (owe ? 'Received in' : 'Paid from')} value={accountId} options={accountOptions} onChange={setAccountId} />
          <DateField label="Date" value={date} onChange={(v) => v && setDate(v)} />
          {sheet === 'borrow' ? <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" /> : null}
          <ErrorText text={error} />
          <Button label="Save" icon="check" onPress={submit} />
        </View>
      </Sheet>

      <Sheet visible={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Delete ${d.person}?`}>
        <View style={{ gap: 14 }}>
          <T v="muted">This removes the record and all {history.length} entries made against it, and puts account balances back as if they never happened. To keep the history, mark it settled instead.</T>
          <Button variant="danger" label="Delete everything" onPress={() => { if (act(db => remove.debt(db, d.id), 'Deleted')) { setConfirmDelete(false); router.back(); } }} />
          {!d.closed ? <Button variant="secondary" label="Mark settled instead" onPress={() => { act(db => upsert.debt(db, { ...d, closed: true }), 'Marked settled'); setConfirmDelete(false); }} /> : null}
        </View>
      </Sheet>
    </Screen>
  );
}
