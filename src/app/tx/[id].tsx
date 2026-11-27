import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useData, safeJson } from '../../data/DataContext';
import { radius, space, useTheme } from '../../theme';
import {
  Button, Chip, Row, Sheet, DateField, ErrorText, Field, FormRow, IconButton, Keypad, Note, Segmented, Select, T, TimeField, Toggle, close, keypadValue,
} from '../../components/ui';
import { CategoryGrid, PhotoField, TagField, useAccountOptions } from '../../components/domain';
import { advanceDue, anchorFor } from '../../lib/ledger';
import { hasOperator } from '../../lib/calc';
import { inputValue, nowMs, toCentavos, toSignedCentavos, todayISO, uid } from '../../lib/money';
import { CURRENCIES, convert, currencyInfo, money, symbolOf } from '../../lib/currency';
import { newTx, restore, setCaptured, setSetting, softDelete, upsert } from '../../db/repo';
import type { Transaction } from '../../db/schema';

type Kind = 'expense' | 'income';
const FREQS = [{ value: 'monthly', label: 'Every month' }, { value: 'semimonthly', label: '15th and 30th' }, { value: 'weekly', label: 'Every week' },
  { value: 'quarterly', label: 'Every 3 months' }, { value: 'yearly', label: 'Every year' }];

function nowTime() { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

export default function Entry() {
  // Prefill (from a receipt scan or a template): amount in pesos as text, note, date, photo, category, account.
  const params = useLocalSearchParams<{ id: string; type?: string; amount?: string; currency?: string; note?: string; date?: string; time?: string; photo?: string; category?: string; account?: string; capture?: string }>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { data, act, curOf, rates } = useData();
  const existing = data.transactions.find(t => t.id === params.id) ?? data.deleted.find(t => t.id === params.id);
  const isNew = !existing;
  const special = existing && existing.type !== 'expense' && existing.type !== 'income';
  const lastUsed = (data.settings.lastUsedAccount as string) || (data.settings.defaultAccountId as string) || data.accounts.find(a => !a.archived)?.id || '';
  const activeTrip = data.trips.find(t => !t.endDate);

  const [kind, setKind] = useState<Kind>(((existing?.type ?? params.type) === 'income' ? 'income' : 'expense'));
  const [expr, setExpr] = useState(existing ? String(Math.abs(existing.origAmount ?? existing.amount) / 100) : params.amount ?? '');
  const [signedAmount, setSignedAmount] = useState(existing?.type === 'adjust' ? String(existing.amount / 100) : '');
  const [keypadOpen, setKeypadOpen] = useState(isNew && !params.amount);
  const [note, setNote] = useState(existing?.note ?? params.note ?? '');
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? params.category ?? '');
  const [accountId, setAccountId] = useState(existing?.accountId ?? (params.account && data.accounts.some(a => a.id === params.account) ? params.account : lastUsed));
  const [date, setDate] = useState(existing?.date ?? (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayISO()));
  const [time, setTime] = useState<string | null>(existing?.time ?? (params.time && /^\d{2}:\d{2}$/.test(params.time) ? params.time : isNew ? nowTime() : null));
  const [photo, setPhoto] = useState<string | null>(existing?.photoUri ?? params.photo ?? null);
  const [tags, setTags] = useState<string[]>(safeJson<string[]>(existing?.tags, []));
  const [tripId, setTripId] = useState<string | null>(existing?.tripId ?? (isNew ? activeTrip?.id ?? null : null));
  const [repeat, setRepeat] = useState(false);
  const [freq, setFreq] = useState('monthly');
  const [error, setError] = useState<string | null>(null);
  const accountOptions = useAccountOptions(existing?.accountId);
  // Paying in another currency: entryCur is what you type in; the account is charged `exact` in its own currency.
  const [pickedCur, setPickedCur] = useState<string | null>(existing?.origCurrency ?? (params.currency ? params.currency.toUpperCase() : null));
  const [curSheet, setCurSheet] = useState(false);
  const [exact, setExact] = useState(existing?.origCurrency ? inputValue(existing.amount) : '');
  const [exactEdited, setExactEdited] = useState(!!existing?.origCurrency);

  const value = useMemo(() => keypadValue(expr), [expr]);
  const accent = kind === 'income' ? c.income : c.spend;
  const cur = curOf(special ? existing!.accountId : accountId);
  const m = (v: number) => money(v, cur);
  const entryCur = special ? cur : pickedCur ?? cur;
  const foreign = entryCur !== cur;
  const autoExact = foreign && value > 0 ? convert(Math.round(value * 100), entryCur, cur, rates) : null;
  const exactMinor = !foreign ? null : exactEdited ? toCentavos(exact || '0') : autoExact;
  const unitRate = foreign ? convert(100, entryCur, cur, rates) : null;
  const accName = data.accounts.find(a => a.id === accountId)?.name ?? 'the account';
  const curChoices = [...new Set([cur, 'PHP', 'USD', ...data.accounts.filter(a => !a.archived).map(a => a.currency), ...CURRENCIES.map(x => x.code)])];

  const isSalary = (id: string | null) => !!id && (id === 'salary' || data.categories.find(x => x.id === id)?.parentId === 'salary');
  const save = () => {
    setError(null);
    if (special) {
      const amt = existing!.type === 'adjust' ? toSignedCentavos(signedAmount) : Math.round(value * 100);
      if (!Number.isFinite(amt) || amt === 0 || (existing!.type !== 'adjust' && amt < 0)) return setError('Enter an amount.');
      if (act(db => upsert.transaction(db, { ...existing!, amount: amt, baseAmount: amt === existing!.amount ? existing!.baseAmount : null, date, time, note: note.trim(), updatedAt: nowMs() }), 'Saved changes')) close();
      return;
    }
    const typed = Math.round(value * 100);
    if (!Number.isFinite(value) || typed <= 0) return setError('Enter an amount greater than zero.');
    if (!accountId) return setError('Pick an account.');
    const amt = foreign ? exactMinor ?? 0 : typed;
    if (foreign && (!Number.isFinite(amt) || amt <= 0)) return setError(`Enter what ${accName} was charged in ${cur}. There’s no saved ${entryCur} rate to work it out.`);
    const row: Transaction = {
      ...(existing ?? newTx({ type: kind, amount: amt, date })),
      type: kind, amount: amt, origAmount: foreign ? typed : null, origCurrency: foreign ? entryCur : null, accountId, categoryId: categoryId || null, date, time, note: note.trim(), photoUri: photo,
      tags: JSON.stringify(tags), tripId, updatedAt: nowMs(),
      // A changed amount, account or original figure gets a fresh peso value.
      baseAmount: existing && existing.amount === amt && existing.accountId === accountId && existing.origAmount === (foreign ? typed : null) ? existing.baseAmount : null,
    };
    const ok = act(db => {
      upsert.transaction(db, row);
      if (isNew) setSetting(db, 'lastUsedAccount', accountId);
      if (isNew && params.capture) setCaptured(db, params.capture.split(','), 'added', row.id);
      if (isNew && repeat) {
        upsert.recurring(db, { id: uid(), name: row.note || (data.categories.find(x => x.id === row.categoryId)?.name ?? (kind === 'income' ? 'Income' : 'Expense')),
          kind: kind === 'income' ? 'income' : 'bill', amount: amt, accountId, toAccountId: null, categoryId: row.categoryId, frequency: freq,
          nextDue: advanceDue(freq, date, anchorFor(freq, date)), anchorDay: anchorFor(freq, date), endDate: null, debtId: null, active: true, createdAt: nowMs() });
      }
    }, isNew ? `${kind === 'income' ? 'Income' : 'Expense'} of ${m(amt)} saved${repeat ? ', repeats' : ''}` : 'Saved changes',
    // A new salary: offer to split it right away.
    isNew && kind === 'income' && isSalary(row.categoryId) ? { label: 'Plan it', run: () => router.push({ pathname: '/paycheck', params: { amount: String((convert(amt, cur, 'PHP', rates) ?? amt) / 100), date } }) } : undefined);
    if (ok) close();
  };

  const saveTemplate = () => {
    const amt = Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
    const name = note.trim() || data.categories.find(x => x.id === categoryId)?.name || (kind === 'income' ? 'Income' : 'Expense');
    act(db => upsert.template(db, { id: uid(), name, type: kind, amount: amt, accountId: accountId || null, toAccountId: null, categoryId: categoryId || null,
      note: note.trim(), tags: JSON.stringify(tags), sort: data.templates.length, createdAt: nowMs() }), `Template “${name}” saved. Find it under the + button.`);
  };

  const del = () => {
    if (!existing) return;
    const id = existing.id;
    if (act(db => softDelete(db, [id]), 'Moved to Recently deleted', { label: 'Undo', run: () => act(db => restore(db, [id])) })) close();
  };

  const title = isNew ? null : special ? ({ adjust: 'Balance correction', goal_in: 'Goal contribution', goal_out: 'Goal withdrawal', goal_interest: 'Goal interest',
    debt_in: 'Debt movement', debt_out: 'Debt movement' } as Record<string, string>)[existing!.type] ?? 'Transaction' : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: space.page, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconButton name="close" label="Close" onPress={close} filled />
        <View style={{ flex: 1 }}>
          {special ? <T v="h2" center>{title}</T>
            : <Segmented value={kind} onChange={(v) => { setKind(v); setCategoryId(''); }} options={[['expense', 'Expense', 'arrow-up'], ['income', 'Income', 'arrow-down']]} />}
        </View>
        {!isNew ? <IconButton name="trash-can-outline" label="Delete" onPress={del} filled color={c.spend} /> : <View style={{ width: 44 }} />}
      </View>

      <ScrollView contentContainerStyle={{ padding: space.page, gap: 18, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
        {special && existing!.type === 'adjust' ? (
          <Field label="Correction amount" big value={signedAmount} onChangeText={setSignedAmount} keyboardType="numbers-and-punctuation" hint="Use a minus sign for money that went missing." />
        ) : (
          <Pressable onPress={() => setKeypadOpen(true)} accessibilityRole="button" accessibilityLabel={`Amount ${m(Math.round(value * 100))}. Tap to edit`}
            style={{ alignItems: 'center', paddingVertical: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
              <T v="numLg" color={expr ? accent : c.faint} style={{ fontSize: 26, marginTop: 10 }}>{symbolOf(entryCur).trim()}</T>
              <T v="display" color={expr ? c.ink : c.faint} style={{ fontSize: 56, lineHeight: 64 }} numberOfLines={1}>
                {expr ? (hasOperator(expr) ? expr : Number(value).toLocaleString('en-PH', { maximumFractionDigits: 2 })) : '0'}
              </T>
            </View>
            {hasOperator(expr) ? <T v="medium" color={c.muted}>= {money(Math.round(value * 100), entryCur)}</T> : null}
            <View style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: keypadOpen ? accent : c.line, marginTop: 6 }} />
          </Pressable>
        )}
        {!special ? (
          <View style={{ alignItems: 'center', marginTop: -8 }}>
            <Chip icon="currency-usd" label={`${entryCur} · ${currencyInfo(entryCur).name}`} onPress={() => setCurSheet(true)} selected={foreign} />
          </View>
        ) : null}
        {foreign ? (
          <View style={{ backgroundColor: c.surface, borderRadius: radius.lg, padding: 14, gap: 10 }}>
            <Field label={`Charged to ${accName} (${cur})`} value={exactEdited ? exact : autoExact !== null ? inputValue(autoExact) : ''} keyboardType="decimal-pad"
              prefix={symbolOf(cur).trim()} placeholder="0" onChangeText={(v) => { setExact(v); setExactEdited(true); }}
              hint={exactEdited ? 'Your exact amount. This is what your balance uses.'
                : unitRate !== null ? `Worked out at 1 ${entryCur} = ${money(unitRate, cur, { cents: true })}. Change it to the exact figure on your app or statement.`
                : `No ${entryCur} rate saved. Type what ${accName} was charged.`} />
            {exactEdited && autoExact !== null ? (
              <Pressable onPress={() => { setExactEdited(false); setExact(''); }} hitSlop={8} accessibilityRole="button">
                <T v="semi" color={c.muted} style={{ fontSize: 14 }}>{`Use the rate instead (${m(autoExact)})`}</T>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Field label="Note" value={note} onChangeText={setNote} placeholder={kind === 'income' ? 'e.g. October salary' : 'e.g. Lunch with team'} maxLength={120} onFocus={() => setKeypadOpen(false)} />
        {!special ? <CategoryGrid kind={kind} value={categoryId} onChange={(id) => { setCategoryId(id); }} /> : null}
        <FormRow>
          <DateField label="Date" value={date} onChange={(v) => v && setDate(v)} />
          <TimeField label="Time" value={time} onChange={setTime} />
        </FormRow>
        {!special ? <Select label="Account" value={accountId} options={accountOptions} onChange={setAccountId} placeholder="Choose an account" /> : null}
        {!special ? <PhotoField value={photo} onChange={setPhoto} label="Photo or receipt" /> : null}
        {!special ? <TagField value={tags} onChange={setTags} /> : null}
        {!special && tripId ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Chip label={data.trips.find(t => t.id === tripId)?.name ?? 'Trip'} icon="airplane" tone="info" />
            <Pressable onPress={() => setTripId(null)} hitSlop={8}><T v="semi" color={c.muted} style={{ fontSize: 14 }}>Not part of this trip</T></Pressable>
          </View>
        ) : null}
        {isNew ? (
          <View style={{ backgroundColor: c.surface, borderRadius: radius.lg, padding: 14, gap: 10 }}>
            <Toggle label={kind === 'income' ? 'Set as recurring income' : 'Set as recurring expense'} hint="Adds it to Planned payments so it shows up on time." value={repeat} onChange={setRepeat} />
            {repeat ? <Select label="Repeats" value={freq} options={FREQS} onChange={setFreq} /> : null}
          </View>
        ) : null}
        {!special ? <Button variant="ghost" small icon="bookmark-plus-outline" label="Save as template" onPress={saveTemplate} /> : null}
        {existing?.deletedAt ? <Note tone="warn" icon="delete-clock-outline">This transaction is in Recently deleted. Restore it from there.</Note> : null}
        <ErrorText text={error} />
      </ScrollView>

      <Sheet visible={curSheet} onClose={() => setCurSheet(false)} title="Paid in">
        <View style={{ gap: 2 }}>
          {curChoices.map(code => (
            <Row key={code} title={`${code} · ${currencyInfo(code).name}`} sub={code === cur ? `${accName}’s currency` : undefined} selected={code === entryCur}
              left={<View style={{ width: 40, alignItems: 'center' }}><T v="h3">{symbolOf(code).trim()}</T></View>}
              onPress={() => { setPickedCur(code === cur ? null : code); setExactEdited(false); setExact(''); setCurSheet(false); }} />
          ))}
        </View>
      </Sheet>

      {keypadOpen && !(special && existing!.type === 'adjust') ? (
        <View style={{ backgroundColor: c.sunk, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 12, paddingBottom: insets.bottom + 12, gap: 10 }}>
          <Keypad expr={expr} onChange={setExpr} onDone={() => setKeypadOpen(false)} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="secondary" icon="chevron-down" label="Hide" small onPress={() => setKeypadOpen(false)} style={{ flex: 1 }} />
            <Button label={isNew ? `Save ${kind}` : 'Save'} onPress={save} small style={{ flex: 2 }} />
          </View>
        </View>
      ) : (
        <View style={{ paddingHorizontal: space.page, paddingTop: 10, paddingBottom: insets.bottom + 12, flexDirection: 'row', gap: 10, borderTopWidth: 1, borderColor: c.line }}>
          <View style={{ flex: 1 }}>
            <Button label={isNew ? `Save ${special ? '' : kind}` : 'Save changes'} icon="check" onPress={save} />
          </View>
        </View>
      )}
    </View>
  );
}
