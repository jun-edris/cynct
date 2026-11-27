import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useData } from '../../data/DataContext';
import { radius, useTheme } from '../../theme';
import { Button, ColorPicker, ErrorText, Field, Footer, FormRow, Icon, IconPicker, List, Screen, Section, Select, T, Toggle, close } from '../../components/ui';
import { TxRow } from '../../components/domain';
import { accountIsUnused, deleteAccount, saveAccount, setSetting, upsert } from '../../db/repo';
import { ACCOUNT_ICONS, ACCOUNT_TYPES, ICON_CHOICES, SWATCHES } from '../../lib/seed';
import { isLiability } from '../../lib/ledger';
import { inputValue, nowMs, toCentavos, toSignedCentavos, uid } from '../../lib/money';
import { BASE, CURRENCIES, money } from '../../lib/currency';
import type { Account } from '../../db/schema';

const NAVY = '#0B1426';

export default function AccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { data, balances, act } = useData();
  const a = data.accounts.find(x => x.id === id);
  const current = a ? balances.get(a.id) ?? 0 : 0;

  const [type, setType] = useState(a?.type ?? 'bank');
  const [currency, setCurrency] = useState(a?.currency ?? BASE);
  const m = (v: number, o?: { sign?: boolean }) => money(v, currency, o);
  const [name, setName] = useState(a?.name ?? '');
  const [color, setColor] = useState(a?.color ?? SWATCHES[data.accounts.length % SWATCHES.length]);
  const [icon, setIcon] = useState(a?.icon ?? ACCOUNT_ICONS.bank);
  const liab = isLiability(type);
  const [balance, setBalance] = useState(() => {
    if (!a) return '';
    const shown = isLiability(a.type) ? -current : current;
    return shown === 0 ? '0' : (shown / 100).toString();
  });
  const [limit, setLimit] = useState(inputValue(a?.creditLimit));
  const [statementDay, setStatementDay] = useState(a?.statementDay ? String(a.statementDay) : '');
  const [dueDay, setDueDay] = useState(a?.dueDay ? String(a.dueDay) : '');
  // Accounts left out of "Safe to spend" (savings, foreign-currency holdings, money you don't touch day to day).
  const stsOut = (data.settings.stsExclude as string[] | undefined) ?? [];
  const [inSafe, setInSafe] = useState(!a || !stsOut.includes(a.id));
  const [note, setNote] = useState(a?.note ?? '');
  const [isDefault, setDefault] = useState(data.settings.defaultAccountId === id);
  const [more, setMore] = useState(!!(a?.statementDay || a?.dueDay || a?.note));
  const [error, setError] = useState<string | null>(null);

  const hasHistory = a ? data.transactions.some(t => t.accountId === a.id || t.toAccountId === a.id) : false;
  const unused = a ? accountIsUnused(data, a.id) : true;
  const recent = a ? data.transactions.filter(t => t.accountId === a.id || t.toAccountId === a.id).slice(0, 8) : [];
  const previewBal = (() => { const v = balance.trim() ? toSignedCentavos(balance) : 0; return Number.isFinite(v) ? v : 0; })();

  const onType = (t: string) => {
    if (icon === ACCOUNT_ICONS[type]) setIcon(ACCOUNT_ICONS[t] ?? icon);
    setType(t);
  };

  const save = () => {
    setError(null);
    if (!name.trim()) return setError('Give the account a name.');
    const entered = balance.trim() === '' ? 0 : toSignedCentavos(balance);
    if (!Number.isFinite(entered)) return setError('Balance must be a number, like 12500.');
    const target = liab ? -entered : entered;
    const creditLimit = liab && limit.trim() ? toCentavos(limit) : null;
    if (creditLimit !== null && !(creditLimit > 0)) return setError('Credit limit must be a number.');
    const day = (s: string) => (s.trim() ? parseInt(s, 10) : null);
    const sd = day(statementDay), dd = day(dueDay);
    if ((sd !== null && !(sd >= 1 && sd <= 31)) || (dd !== null && !(dd >= 1 && dd <= 31))) return setError('Days must be between 1 and 31.');
    const row: Account = {
      id: a?.id ?? uid(), name: name.trim(), type, color, icon, currency, opening: !a || !hasHistory ? target : a.opening,
      creditLimit, statementDay: liab ? sd : null, dueDay: liab ? dd : null, note: note.trim(), archived: a?.archived ?? false,
      sort: a?.sort ?? data.accounts.length, createdAt: a?.createdAt ?? nowMs(),
    };
    const correction = a && hasHistory ? target - current : 0;
    const ok = act(db => {
      saveAccount(db, row, correction);
      if (isDefault) setSetting(db, 'defaultAccountId', row.id);
      else if (data.settings.defaultAccountId === row.id) setSetting(db, 'defaultAccountId', null);
      else if (!data.settings.defaultAccountId && !a) setSetting(db, 'defaultAccountId', row.id);
      const nextOut = inSafe || liab ? stsOut.filter(x => x !== row.id) : [...new Set([...stsOut, row.id])];
      if (nextOut.length !== stsOut.length) setSetting(db, 'stsExclude', nextOut);
    }, correction ? `Saved, corrected by ${m(correction, { sign: true })}` : a ? 'Saved changes' : `Added ${row.name}`);
    if (ok) close();
  };

  const archive = () => { if (a && act(db => upsert.account(db, { ...a, archived: !a.archived }), a.archived ? 'Unarchived' : 'Archived. History is kept.')) close(); };
  const del = () => { if (a && act(db => deleteAccount(db, a.id), 'Account deleted')) close(); };

  return (
    <>
      <Screen title={a ? a.name : 'Add account'} back padBottom={30}>
        <View style={{ backgroundColor: color, borderRadius: radius.xl, padding: 20, minHeight: 180, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(11,20,38,0.12)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={icon} size={26} color={NAVY} />
            </View>
            <T v="semi" color={NAVY} style={{ opacity: 0.75 }}>{ACCOUNT_TYPES[type]}</T>
          </View>
          <View>
            <T v="h3" color={NAVY}>{name || 'Account name'}</T>
            <T v="label" color={NAVY} style={{ opacity: 0.7, marginTop: 6 }}>{liab ? 'Owed' : 'Balance'}</T>
            <T v="display" color={NAVY} style={{ fontSize: 34, lineHeight: 40 }}>{m(previewBal)}</T>
          </View>
        </View>

        <View style={{ gap: 16, marginTop: 18 }}>
          <Select label="Account type" value={type} onChange={onType}
            options={Object.entries(ACCOUNT_TYPES).map(([value, label]) => ({ value, label, icon: ACCOUNT_ICONS[value], color: c.muted }))} />
          {hasHistory ? (
            <T v="small">{`Currency: ${currency}. It can’t change once the account has entries, because past amounts are in ${currency}.`}</T>
          ) : (
            <Select label="Currency" value={currency} onChange={setCurrency}
              options={CURRENCIES.map(x => ({ value: x.code, label: `${x.code} · ${x.name}`, icon: x.code === BASE ? 'cash' : 'currency-usd' }))} />
          )}
          <Field label="Account name" value={name} onChangeText={setName} placeholder="e.g. BPI, GCash, Cash" maxLength={40} />
          <Field label={liab ? (a ? 'Amount you owe right now' : 'Amount you owe') : a ? 'Real balance right now' : 'Starting balance'}
            big value={balance} onChangeText={setBalance} keyboardType="numbers-and-punctuation" placeholder="0"
            hint={a && hasHistory ? `Cynct thinks it’s ${m(liab ? -current : current)}. A different number is saved as a correction today.` : 'Your balance before anything you log here.'} />
          {type === 'credit' ? <Field label="Credit limit (optional)" value={limit} onChangeText={setLimit} keyboardType="decimal-pad" placeholder="e.g. 50000" /> : null}
          <IconPicker value={icon} icons={ICON_CHOICES} color={color} onChange={setIcon} />
          <ColorPicker value={color} colors={SWATCHES} onChange={setColor} />
          <Pressable onPress={() => setMore(!more)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
            <View><T v="semi">More options</T><T v="small">{liab ? 'Statement and due dates, notes' : 'Notes'}</T></View>
            <Icon name={more ? 'chevron-up' : 'chevron-down'} color={c.muted} />
          </Pressable>
          {more ? (
            <View style={{ gap: 16 }}>
              {liab ? (
                <FormRow>
                  <Field label="Statement day" value={statementDay} onChangeText={setStatementDay} keyboardType="number-pad" placeholder="e.g. 3" maxLength={2} />
                  <Field label="Payment due day" value={dueDay} onChangeText={setDueDay} keyboardType="number-pad" placeholder="e.g. 25" maxLength={2} />
                </FormRow>
              ) : null}
              {liab ? <T v="small">The due day puts your card balance on the cashflow forecast.</T> : null}
              <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" maxLength={120} />
            </View>
          ) : null}
          <Toggle label="Default for quick entry" hint="Used when you don’t name an account, like “gas 250”." value={isDefault} onChange={setDefault} />
          {!liab ? <Toggle label="Count in safe to spend" hint="Turn off for savings or money you don’t spend day to day. It still counts in your net worth." value={inSafe} onChange={setInSafe} /> : null}
          {a && !unused && !a.archived ? <T v="small">This account has history or is used by a plan or goal, so it can be archived but not deleted.</T> : null}
          <ErrorText text={error} />
          {a ? <Button variant="danger" label={a.archived ? 'Unarchive' : unused ? 'Delete account' : 'Archive account'} onPress={a.archived || !unused ? archive : del} /> : null}
        </View>

        {recent.length ? <Section title="Recent activity"><List>{recent.map(t => <TxRow key={t.id} t={t} showDate />)}</List></Section> : null}
      </Screen>
      <Footer><Button label={a ? 'Save changes' : 'Add account'} icon="check" onPress={save} style={{ flex: 1 }} /></Footer>
    </>
  );
}
