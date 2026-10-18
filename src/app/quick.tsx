import React, { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useData } from '../data/DataContext';
import { fonts, radius, useTheme } from '../theme';
import { Button, Card, Chip, Footer, Screen, Section, T } from '../components/ui';
import { useCategoryName } from '../components/domain';
import { parseQuickEntry } from '../lib/parse';
import { dayLabel, nowMs, todayISO } from '../lib/money';
import { newTx, setSetting, upsert } from '../db/repo';

const EXAMPLES = ['lunch 180 gcash', 'gas 250', '+50k salary wise', '35k wise > house fund', 'spotify 149 maya yesterday', 'groceries 1.2k'];

export default function Quick() {
  const { c } = useTheme();
  const { data, parseCats, act, curOf, fmt } = useData();
  const catName = useCategoryName();
  const [text, setText] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const def = (data.settings.defaultAccountId as string) || (data.settings.lastUsedAccount as string) || data.accounts.find(a => !a.archived)?.id || null;
  const p = useMemo(() => {
    const r = parseQuickEntry(text, { accounts: data.accounts, categories: parseCats, defaultAccountId: def });
    // Different currencies need the amount that arrived; the Transfer screen asks for it.
    if (r.type === 'transfer' && r.accountId && r.toAccountId && curOf(r.accountId) !== curOf(r.toAccountId)) {
      r.errors.push(`Those accounts use different currencies. Use Transfer to enter what arrived.`);
    }
    return r;
  }, [text, data.accounts, parseCats, def, curOf]);
  const accName = (id: string | null) => data.accounts.find(a => a.id === id)?.name;
  const activeTrip = data.trips.find(t => !t.endDate);

  const save = () => {
    if (!text.trim() || p.errors.length) return;
    const d = new Date();
    const time = p.date === todayISO() ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : null;
    const row = newTx({ type: p.type, amount: p.amount, accountId: p.accountId, toAccountId: p.toAccountId, categoryId: p.categoryId, date: p.date, time,
      note: p.note, tripId: activeTrip?.id ?? null, createdAt: nowMs() });
    const summary = `${p.type === 'transfer' ? 'Moved' : p.type === 'income' ? 'Income' : 'Spent'} ${fmt(p.amount, p.accountId)}`;
    if (act(db => { upsert.transaction(db, row); if (p.type !== 'transfer' && p.accountId) setSetting(db, 'lastUsedAccount', p.accountId); }, summary)) {
      setLog(l => [`${summary} · ${text.trim()}`, ...l].slice(0, 6));
      setText('');
    }
  };

  return (
    <>
      <Screen title="Type it" subtitle="Write it like a text message. Cynct figures out the rest." back padBottom={30}>
        <TextInput value={text} onChangeText={setText} placeholder="lunch 180 gcash" placeholderTextColor={c.faint} autoFocus autoCapitalize="none"
          returnKeyType="done" onSubmitEditing={save} accessibilityLabel="Quick entry" multiline={false}
          style={{ fontFamily: fonts.num, fontSize: 24, minHeight: 64, borderRadius: radius.lg, borderWidth: 2, borderColor: c.mango, paddingHorizontal: 18, color: c.ink, backgroundColor: c.surface }} />
        {text.trim() ? (
          <Card style={{ marginTop: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Chip label={p.type === 'transfer' ? 'Transfer' : p.type === 'income' ? 'Income' : 'Expense'} tone={p.type === 'income' ? 'good' : p.type === 'transfer' ? 'info' : 'bad'} />
              {p.amount > 0 ? <Chip label={fmt(p.amount, p.accountId)} /> : null}
              {p.accountId ? <Chip label={p.toAccountId ? `${accName(p.accountId)} → ${accName(p.toAccountId)}` : accName(p.accountId) ?? ''} icon="wallet-outline" /> : null}
              {p.categoryId ? <Chip label={catName(p.categoryId) ?? ''} icon="shape-outline" /> : null}
              {p.date !== todayISO() ? <Chip label={dayLabel(p.date)} icon="calendar-blank" /> : null}
              {p.note ? <Chip label={`“${p.note}”`} /> : null}
            </View>
            {p.errors.length ? <T v="medium" color={c.spend}>{p.errors[0]}</T> : <T v="small">Press enter or Save to log it.</T>}
          </Card>
        ) : (
          <Section title="Try">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{EXAMPLES.map(e => <Chip key={e} label={e} onPress={() => setText(e)} />)}</View>
            <T v="small" style={{ marginTop: 12 }}>Name an account (gcash, wise) or it uses your default. “+” or salary means income. Two accounts or “{">"}” means a transfer. Add “yesterday” to backdate.</T>
          </Section>
        )}
        {log.length ? (
          <Section title="Just added">
            <Card style={{ gap: 8 }}>{log.map((l, i) => <T key={i} v="medium">{l}</T>)}</Card>
          </Section>
        ) : null}
      </Screen>
      <Footer><Button label="Save" icon="check" onPress={save} disabled={!text.trim() || p.errors.length > 0} style={{ flex: 1 }} /></Footer>
    </>
  );
}
