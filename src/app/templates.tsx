import React, { useState } from 'react';
import { View } from 'react-native';
import { useData } from '../data/DataContext';
import { useApplyTemplate } from '../data/actions';
import { useTheme } from '../theme';
import { Button, Empty, ErrorText, Field, IconBubble, IconButton, List, Row, Screen, Segmented, Select, Sheet, T } from '../components/ui';
import { useAccountOptions, useCategoryOptions } from '../components/domain';
import { remove, upsert } from '../db/repo';
import { money } from '../lib/currency';
import { inputValue, nowMs, toCentavos, uid } from '../lib/money';
import type { Template } from '../db/schema';

type Kind = 'expense' | 'income';

export default function Templates() {
  const { c } = useTheme();
  const { data, act, catById, curOf } = useData();
  const apply = useApplyTemplate();
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const [kind, setKind] = useState<Kind>('expense');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const accountOptions = useAccountOptions();
  const catOptions = useCategoryOptions(kind);
  const tpl = editing && editing !== 'new' ? editing : null;

  const open = (t: Template | 'new') => {
    setError(null); setEditing(t);
    const x = t === 'new' ? null : t;
    setKind(x?.type === 'income' ? 'income' : 'expense'); setName(x?.name ?? ''); setAmount(inputValue(x?.amount));
    setAccountId(x?.accountId ?? (data.settings.defaultAccountId as string) ?? ''); setCategoryId(x?.categoryId ?? ''); setNote(x?.note ?? '');
  };
  const save = () => {
    if (!name.trim()) return setError('Name it, like “Jeep fare” or “Coffee”.');
    const amt = amount.trim() ? toCentavos(amount) : 0;
    if (!(amt >= 0)) return setError('Amount must be a number, or leave it blank to type it each time.');
    const row: Template = { id: tpl?.id ?? uid(), name: name.trim(), type: kind, amount: amt, accountId: accountId || null, toAccountId: null,
      categoryId: categoryId || null, note: note.trim(), tags: tpl?.tags ?? '[]', sort: tpl?.sort ?? data.templates.length, createdAt: tpl?.createdAt ?? nowMs() };
    if (act(db => upsert.template(db, row), tpl ? 'Saved' : `Added ${row.name}`)) setEditing(null);
  };

  return (
    <Screen title="Templates" subtitle="Entries you repeat, one tap away. They also show under the + button." back
      right={<Button small icon="plus" label="New" onPress={() => open('new')} />}>
      {data.templates.length ? (
        <List>{data.templates.map(t => {
          const cat = t.categoryId ? catById.get(t.categoryId) : undefined;
          const acc = data.accounts.find(a => a.id === t.accountId);
          return (
            <Row key={t.id} left={<IconBubble icon={cat?.icon ?? (t.type === 'income' ? 'cash-plus' : 'cash-minus')} color={cat?.color ?? c.muted} />}
              title={t.name} sub={[cat?.name, acc?.name ?? 'Pick account when used'].filter(Boolean).join(' · ')} onPress={() => open(t)}
              right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T v="num" color={t.type === 'income' ? c.income : c.ink}>{t.amount ? money(t.amount, curOf(t.accountId), { cents: 'auto' }) : 'Ask'}</T>
                <IconButton name="plus" label={`Add ${t.name} now`} onPress={() => apply(t.id)} size={36} filled />
              </View>} />
          );
        })}</List>
      ) : <Empty icon="bookmark-outline" title="No templates yet" text="Save things you log often, like your jeep fare or morning coffee. Or tap “Save as template” on any expense." action="Create one" onAction={() => open('new')} />}
      <T v="small" style={{ marginTop: 12 }}>Tap + to record it today. A template without an amount or account opens the entry screen instead.</T>

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={tpl ? tpl.name : 'New template'}>
        <View style={{ gap: 14 }}>
          <Segmented value={kind} onChange={(v) => { setKind(v); setCategoryId(''); }} options={[['expense', 'Expense'], ['income', 'Income']]} />
          <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Jeep fare" maxLength={40} />
          <Field label="Amount (optional)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Blank = ask each time" />
          <Select label="Account" value={accountId} options={[{ value: '', label: 'Ask each time', icon: 'help-circle-outline' }, ...accountOptions]} onChange={setAccountId} />
          <Select label="Category" value={categoryId} options={catOptions} onChange={setCategoryId} />
          <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" maxLength={120} />
          <ErrorText text={error} />
          <Button label="Save" icon="check" onPress={save} />
          {tpl ? <Button variant="danger" label="Delete template" onPress={() => { if (act(db => remove.template(db, tpl.id), 'Template deleted')) setEditing(null); }} /> : null}
        </View>
      </Sheet>
    </Screen>
  );
}
