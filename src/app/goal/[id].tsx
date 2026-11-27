import React, { useState } from 'react';
import { Image, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useData, safeJson } from '../../data/DataContext';
import { radius, useTheme } from '../../theme';
import { CoinJar, GlassIcon, KHeader, KSheet, OnNight } from '../../components/k';
import { Button, Card, DateField, Empty, ErrorText, Field, List, Row, Screen, Section, Select, Sheet, StatTile, T } from '../../components/ui';
import { TxRow, useAccountOptions } from '../../components/domain';
import { goalProgress } from '../../lib/ledger';
import { compactPeso, dayLabel, peso, toCentavos, todayISO } from '../../lib/money';
import { goalMove, remove, softDelete } from '../../db/repo';
import { toBase } from '../../lib/currency';

export default function GoalDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { data, baseBalances, rtx, act, accById, toast, fmt, curOf, rates } = useData();
  const g = data.goals.find(x => x.id === id);
  const [move, setMove] = useState<'in' | 'out' | null>(null);
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState((data.settings.defaultAccountId as string) || data.accounts.find(a => !a.archived)?.id || '');
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const accountOptions = useAccountOptions();
  if (!g) return <Screen title="Goal" back><Empty title="This goal no longer exists" /></Screen>;

  const linked = safeJson<string[]>(g.accountIds, []);
  const p = goalProgress({ ...g, annualRate: g.annualRate / 10_000, accountIds: linked }, baseBalances, rtx);
  const log = data.transactions.filter(t => t.goalId === g.id);
  const perAccount = new Map<string, { in: number; out: number }>();
  for (const t of log) {
    if (!t.accountId) continue;
    const e = perAccount.get(t.accountId) ?? { in: 0, out: 0 };
    if (t.type === 'goal_in') e.in += t.amount;
    if (t.type === 'goal_out') e.out += t.amount;
    perAccount.set(t.accountId, e);
  }

  const submit = () => {
    setError(null);
    const amt = toCentavos(amount);
    if (!(amt > 0)) return setError('Enter an amount.');
    if (!accountId) return setError('Pick an account.');
    // Goal funds are tracked in pesos; an account in another currency is compared at your rate.
    if (move === 'out' && toBase(amt, curOf(accountId), rates) > p.fund) return setError(`Only ${peso(p.fund)} is held inside this goal.`);
    const kind = move!;
    let txId = '';
    if (act(db => { txId = goalMove(db, g, kind, accountId, amt, date).id; }, kind === 'in' ? `Added ${peso(amt)} to ${g.name}` : `Withdrew ${peso(amt)}`,
      { label: 'Undo', run: () => act(db => softDelete(db, [txId])) })) {
      setMove(null); setAmount('');
      if (kind === 'in') {
        // Senti drops in for a saving too.
        const after = Math.min(1, (p.saved + toBase(amt, curOf(accountId), rates)) / Math.max(1, g.target));
        router.push({ pathname: '/saved', params: { kind: 'save', tx: txId, ask: '1', title: `${g.name} · from ${data.accounts.find(a => a.id === accountId)?.name ?? ''}`,
          amount: `Saved ${peso(amt, { cents: false })}`, sub: `${Math.round(after * 100)}% there` } });
      }
    }
  };

  const del = () => {
    if (p.fund > 0) return toast(`Withdraw the ${peso(p.fund)} held in this goal first.`);
    if (act(db => remove.goal(db, g.id), `Deleted ${g.name}`)) router.back();
  };

  return (
    <Screen headerless edge>
      <KHeader title={g.name} back right={<>
        <GlassIcon name="pencil-outline" label="Edit goal" onPress={() => router.push(`/goal-edit/${g.id}`)} />
        <GlassIcon name="trash-can-outline" label="Delete goal" onPress={del} />
      </>}>
        <OnNight style={{ marginTop: 12 }}>Saved so far</OnNight>
        <T v="display" color="#FFFFFF" style={{ fontSize: 46, lineHeight: 54 }} numberOfLines={1}>{peso(p.saved)}</T>
        <OnNight v="xs">of {peso(g.target, { cents: false })} · {Math.round(p.pct * 1000) / 10}%</OnNight>
        <View style={{ alignItems: 'center', marginTop: 12 }}>
          <CoinJar pct={p.pct} width={170} label={compactPeso(g.target)} />
        </View>
      </KHeader>
      <KSheet>
      {g.photoUri ? <Image source={{ uri: g.photoUri }} style={{ width: '100%', height: 160, borderRadius: radius.xl, marginBottom: 12 }} /> : null}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Button icon="plus" label="Add money" onPress={() => setMove('in')} style={{ flex: 1 }} />
        <Button icon="arrow-u-left-top" variant="secondary" label="Withdraw" onPress={() => setMove('out')} style={{ flex: 1 }} disabled={p.fund <= 0} />
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <StatTile label="Left to save" value={compactPeso(p.left)} />
        <StatTile label={p.months < 1 ? 'Needed by deadline' : 'Needed monthly'} value={compactPeso(p.needed)} color={p.onTrack ? c.income : c.warn} sub={`plan ${compactPeso(g.monthly)}`} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <StatTile label="Interest earned" value={compactPeso(p.interest)} color={c.income} sub={g.annualRate ? `${g.annualRate / 100}% a year, monthly` : 'No rate set'} />
        <StatTile label="Projected" value={compactPeso(p.projected)} sub={`by ${dayLabel(g.deadline)}`} />
      </View>

      <Section title="Details">
        <Card style={{ gap: 10 }}>
          {[
            ['Starting amount', peso(g.startingSaved)],
            ['Moved in', peso(p.movedIn)],
            ['Moved out', peso(p.movedOut)],
            ['Held inside the goal', peso(p.fund)],
            linked.length ? ['Counted from accounts', `${peso(p.linked)} (${linked.map(l => accById.get(l)?.name).filter(Boolean).join(', ')})`] : null,
            ['Target date', dayLabel(g.deadline)],
          ].filter(Boolean).map(row => (
            <View key={row![0]} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <T v="medium" color={c.muted}>{row![0]}</T><T v="semi" style={{ flexShrink: 1, textAlign: 'right' }}>{row![1]}</T>
            </View>
          ))}
          {g.note ? <T v="muted" style={{ marginTop: 4 }}>{g.note}</T> : null}
        </Card>
      </Section>

      {perAccount.size ? (
        <Section title="By account">
          <List>{[...perAccount.entries()].map(([aid, v]) => {
            const a = accById.get(aid);
            return <Row key={aid} icon={a?.icon ?? 'wallet'} iconColor={a?.color} title={a?.name ?? 'Account'} sub={`Added ${fmt(v.in, aid)} · withdrew ${fmt(v.out, aid)}`}
              right={<T v="num">{fmt(v.in - v.out, aid)}</T>} />;
          })}</List>
        </Section>
      ) : null}

      <Section title="Log">
        {log.length ? <List>{log.map(t => <TxRow key={t.id} t={t} showDate />)}</List>
          : <Empty icon="history" title="No movements yet" text="Money you add or withdraw, and interest earned, shows here." />}
      </Section>

      <Sheet visible={!!move} onClose={() => setMove(null)} title={move === 'in' ? `Add to ${g.name}` : `Withdraw from ${g.name}`}>
        <View style={{ gap: 14 }}>
          <Field label="Amount" big value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" autoFocus />
          <Select label={move === 'in' ? 'From account' : 'Into account'} value={accountId} options={accountOptions} onChange={setAccountId} />
          <DateField label="Date" value={date} onChange={(v) => v && setDate(v)} />
          <T v="small">{move === 'in' ? 'The money leaves the account and is held inside the goal. It still counts toward your net worth, not as spending.' : `Up to ${peso(p.fund)} can be withdrawn.`}</T>
          <ErrorText text={error} />
          <Button label={move === 'in' ? 'Add money' : 'Withdraw'} icon="check" onPress={submit} />
        </View>
      </Sheet>
      </KSheet>
    </Screen>
  );
}
