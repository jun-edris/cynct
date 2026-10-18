import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useData, safeJson } from '../../data/DataContext';
import { Button, Chip, ColorPicker, DateField, ErrorText, Field, Footer, FormRow, Screen, T, close } from '../../components/ui';
import { PhotoField } from '../../components/domain';
import { upsert } from '../../db/repo';
import { SWATCHES } from '../../lib/seed';
import { addMonths, requiredMonthly, inputValue, monthsBetween, nowMs, peso, toCentavos, todayISO, uid } from '../../lib/money';

export default function GoalEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, act } = useData();
  const g = data.goals.find(x => x.id === id);
  const [name, setName] = useState(g?.name ?? '');
  const [target, setTarget] = useState(inputValue(g?.target));
  const [starting, setStarting] = useState(inputValue(g?.startingSaved));
  const [monthly, setMonthly] = useState(inputValue(g?.monthly));
  const [rate, setRate] = useState(g?.annualRate ? String(g.annualRate / 100) : '');
  const [deadline, setDeadline] = useState(g?.deadline ?? addMonths(todayISO(), 36));
  const [accountIds, setAccountIds] = useState<string[]>(safeJson<string[]>(g?.accountIds, []));
  const [color, setColor] = useState(g?.color ?? SWATCHES[0]);
  const [photo, setPhoto] = useState<string | null>(g?.photoUri ?? null);
  const [note, setNote] = useState(g?.note ?? '');
  const [archived] = useState(g?.archived ?? false);
  const [error, setError] = useState<string | null>(null);
  const accounts = data.accounts.filter(a => !a.archived || accountIds.includes(a.id));

  const tgt = toCentavos(target);
  const start = toCentavos(starting) || 0;
  const months = Math.max(1, monthsBetween(todayISO(), deadline));
  const suggestion = tgt > 0 ? requiredMonthly(tgt, start, months, (Number(rate) || 0) / 100) : 0;

  const save = () => {
    setError(null);
    if (!name.trim()) return setError('Give the goal a name.');
    if (!(tgt > 0)) return setError('Enter a target amount.');
    const r = Number(rate || 0);
    if (!(r >= 0 && r < 100)) return setError('Interest must be between 0 and 100%.');
    const row = {
      id: g?.id ?? uid(), name: name.trim(), target: tgt, deadline, monthly: toCentavos(monthly) || 0, annualRate: Math.round(r * 100),
      accountIds: JSON.stringify(accountIds), startingSaved: start, interestCreditedThrough: g?.interestCreditedThrough ?? null,
      photoUri: photo, note: note.trim(), color, archived, createdAt: g?.createdAt ?? nowMs(),
    };
    if (act(db => upsert.goal(db, row), g ? 'Goal saved' : `Created ${row.name}`)) {
      if (g) close(); else router.replace(`/goal/${row.id}`);
    }
  };

  return (
    <>
      <Screen title={g ? 'Edit goal' : 'New goal'} back padBottom={30}>
        <View style={{ gap: 16 }}>
          <PhotoField value={photo} onChange={setPhoto} label="Cover photo" />
          <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Bahay sa Bohol" maxLength={40} />
          <Field label="Target" big value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="0" />
          <FormRow>
            <View style={{ flex: 1 }}><Field label="Already saved" value={starting} onChangeText={setStarting} keyboardType="decimal-pad" placeholder="0" /></View>
            <View style={{ flex: 1 }}><Field label="Interest % a year" value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="0" /></View>
          </FormRow>
          <T v="small">“Already saved” is money you had before tracking here. Interest is credited monthly on what the goal holds.</T>
          <DateField label="Target date" value={deadline} onChange={(v) => v && setDeadline(v)} />
          <Field label="Monthly plan" value={monthly} onChangeText={setMonthly} keyboardType="decimal-pad" placeholder="0"
            hint={suggestion ? `To hit it on time: about ${peso(suggestion, { cents: false })} a month for ${months} months.` : undefined} />
          {suggestion ? <Chip icon="auto-fix" label={`Use ${peso(suggestion, { cents: false })}`} onPress={() => setMonthly(inputValue(suggestion))} /> : null}
          <View style={{ gap: 8 }}>
            <T v="label">Also count these accounts</T>
            <T v="small">Their whole balance counts toward this goal, like a dedicated savings account.</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {accounts.map(a => {
                const on = accountIds.includes(a.id);
                return <Chip key={a.id} icon={a.icon} label={a.name} selected={on} onPress={() => setAccountIds(on ? accountIds.filter(x => x !== a.id) : [...accountIds, a.id])} />;
              })}
            </View>
          </View>
          <ColorPicker value={color} colors={SWATCHES} onChange={setColor} />
          <Field label="Notes" value={note} onChangeText={setNote} placeholder="Optional" multiline />
          <ErrorText text={error} />
        </View>
      </Screen>
      <Footer><Button label={g ? 'Save changes' : 'Create goal'} icon="check" onPress={save} style={{ flex: 1 }} /></Footer>
    </>
  );
}
