import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useData } from '../data/DataContext';
import { useRefreshRates, type FxCache } from '../data/actions';
import { fonts, radius, useTheme } from '../theme';
import { Button, Card, ErrorText, Field, Icon, IconBubble, IconButton, List, Note, Row, Screen, Section, Sheet, T, Toggle } from '../components/ui';
import { removeRate, setRate, setSetting } from '../db/repo';
import { BASE, CURRENCIES, convert, currencyInfo, money, rateLabel, rateToText, textToRate } from '../lib/currency';
import { dayLabel, nowMs, todayISO, toCentavos } from '../lib/money';

function ago(ms: number) {
  const min = Math.round((nowMs() - ms) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : dayLabel(todayISO(new Date(ms)));
}

function CurrencyPicker({ visible, onClose, onPick, selected, title }: { visible: boolean; onClose: () => void; onPick: (code: string) => void; selected: string; title: string }) {
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const list = CURRENCIES.filter(x => !q.trim() || `${x.code} ${x.name}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.sunk, borderRadius: radius.pill, paddingHorizontal: 14, marginBottom: 12 }}>
        <Icon name="magnify" size={20} color={c.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search currency" placeholderTextColor={c.faint} accessibilityLabel="Search currency" autoCapitalize="none"
          style={{ flex: 1, minHeight: 46, color: c.ink, fontFamily: fonts.medium, fontSize: 16 }} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {list.map(x => {
          const on = x.code === selected;
          return (
            <Pressable key={x.code} onPress={() => { onPick(x.code); setQ(''); onClose(); }} accessibilityRole="button" accessibilityLabel={`${x.code} ${x.name}`}
              style={({ pressed }) => ({ width: '31.5%', paddingVertical: 12, borderRadius: radius.md, alignItems: 'center', gap: 2, borderWidth: 1.5,
                borderColor: on ? c.mango : c.line, backgroundColor: on ? c.mangoSoft : c.surface, opacity: pressed ? 0.7 : 1 })}>
              <T v="numLg" style={{ fontSize: 18 }} numberOfLines={1}>{x.symbol.trim()}</T>
              <T v="semi" style={{ fontSize: 13 }}>{x.code}</T>
            </Pressable>
          );
        })}
      </View>
      {!list.length ? <T v="muted" style={{ textAlign: 'center', marginTop: 12 }}>No match.</T> : null}
    </Sheet>
  );
}

export default function Currencies() {
  const { c } = useTheme();
  const { data, act, rates, missing, balances, toast } = useData();
  const refresh = useRefreshRates();
  const fx = data.settings.fx as FxCache | undefined;
  const pinned = (data.settings.pinnedRates as string[] | undefined) ?? [];
  const auto = data.settings.autoRates !== false;
  const [busy, setBusy] = useState(false);
  // converter
  const [amt, setAmt] = useState('1');
  const [from, setFrom] = useState(data.accounts.find(a => a.currency !== BASE)?.currency ?? 'USD');
  const [to, setTo] = useState(BASE);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  // rate editor
  const [editing, setEditing] = useState<string | null>(null);
  const [rateText, setRateText] = useState('');
  const [pin, setPin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const used = [...new Set(data.accounts.filter(a => !a.archived && a.currency !== BASE).map(a => a.currency))].sort();
  const minor = toCentavos(amt || '0');
  // The converter shows market rates; your kept rates only apply to your accounts.
  const market = new Map([...rates, ...Object.entries(fx?.perUnit ?? {})]);
  const out = convert(minor > 0 ? minor : 0, from, to, market);
  const unit = convert(100, from, to, market);

  const doRefresh = async () => {
    setBusy(true);
    try { const r = await refresh(); toast(`Rates updated from ${r.source}`); }
    catch (e) { toast(e instanceof Error ? e.message : 'Couldn’t update rates.'); }
    finally { setBusy(false); }
  };

  const open = (code: string) => {
    setError(null); setEditing(code); setPin(pinned.includes(code));
    const r = rates.get(code);
    setRateText(r ? rateToText(r) : '');
  };
  const save = () => {
    if (!editing) return;
    const v = textToRate(rateText);
    if (!(v > 0)) return setError('Enter how many pesos one unit is worth, like 58.25.');
    const code = editing;
    const nextPinned = pin ? [...new Set([...pinned, code])] : pinned.filter(x => x !== code);
    if (act(db => { setRate(db, code, v); setSetting(db, 'pinnedRates', nextPinned); }, `1 ${code} = ₱${rateLabel(v)}${pin ? ' (kept)' : ''}`)) setEditing(null);
  };
  const unpinAndReset = () => {
    if (!editing) return;
    const code = editing;
    act(db => { removeRate(db, code); setSetting(db, 'pinnedRates', pinned.filter(x => x !== code)); }, `${code} follows live rates again`);
    setEditing(null);
  };

  return (
    <Screen title="Currencies" subtitle="Live rates for converting, and for adding up accounts in other currencies." back>
      <Card style={{ gap: 12 }}>
        <T v="label">Amount</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.sunk, borderRadius: radius.md, paddingHorizontal: 14 }}>
          <T v="numLg" color={c.muted} style={{ fontSize: 20 }}>{currencyInfo(from).symbol.trim()}</T>
          <TextInput value={amt} onChangeText={setAmt} keyboardType="decimal-pad" accessibilityLabel="Amount to convert" placeholder="0" placeholderTextColor={c.faint}
            style={{ flex: 1, minHeight: 60, color: c.ink, fontFamily: fonts.numBlack, fontSize: 28 }} />
        </View>
        <T v="label" style={{ marginTop: 4 }}>Converted</T>
        <T v="display" numberOfLines={1}>{out === null ? '—' : money(out, to)}</T>
        <T v="small">
          {fx ? `Live via ${fx.source} · ${ago(fx.at)}` : 'No live rates yet'}
          {unit !== null && from !== to ? ` · 1 ${from} = ${money(unit, to, { cents: true })}` : ''}
        </T>
        <Button small variant="secondary" icon="refresh" label={busy ? 'Updating…' : 'Refresh rates'} onPress={doRefresh} disabled={busy} style={{ alignSelf: 'flex-start' }} />
      </Card>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
        {(['from', 'to'] as const).map((side, i) => {
          const code = side === 'from' ? from : to;
          const card = (
            <Card key={side} style={{ flex: 1, gap: 2 }} onPress={() => setPicking(side)}>
              <T v="label">{side === 'from' ? 'From' : 'To'}</T>
              <T v="h2">{code}</T>
              <T v="small" numberOfLines={1}>{currencyInfo(code).name}</T>
            </Card>
          );
          return i === 0 ? <React.Fragment key={side}>{card}<IconButton name="swap-horizontal" label="Swap currencies" filled onPress={() => { setFrom(to); setTo(from); }} /></React.Fragment> : card;
        })}
      </View>

      {missing.length ? <View style={{ marginTop: 16 }}><Note tone="warn" icon="currency-usd-off">{`No rate yet for ${missing.join(', ')}. Tap Refresh rates while online, or set one by hand below.`}</Note></View> : null}

      <Section title="Your currencies">
        {used.length ? (
          <List>{used.map(code => {
            const r = rates.get(code);
            const total = data.accounts.filter(a => !a.archived && a.currency === code).reduce((s, a) => s + (balances.get(a.id) ?? 0), 0);
            const isPinned = pinned.includes(code);
            return (
              <Row key={code} left={<IconBubble icon={isPinned ? 'pin-outline' : 'swap-horizontal'} color={r ? c.income : c.warn} />}
                title={`1 ${code} = ${r ? `₱${rateLabel(r)}` : 'not set'}`}
                sub={`${isPinned ? 'Your rate' : 'Live'} · ${money(total, code)} in accounts`} onPress={() => open(code)} chevron />
            );
          })}</List>
        ) : <T v="muted">All your accounts are in pesos. Pick a currency when you add an account (e.g. a USD Wise balance) and it’s converted here automatically.</T>}
      </Section>

      <Section title="Updates">
        <Card style={{ gap: 10 }}>
          <Toggle label="Update rates automatically" hint="When you open the app, if rates are over 6 hours old and you’re online. Needs internet only for that moment."
            value={auto} onChange={(v) => act(db => setSetting(db, 'autoRates', v), v ? 'Automatic rates on' : 'Automatic rates off')} />
          <T v="small">Rates are mid-market from FXRatesAPI, with ExchangeRate-API as a backup. Your bank or Wise rate differs a little; when you record a transfer between currencies, enter what actually arrived to keep balances exact.</T>
        </Card>
      </Section>

      <CurrencyPicker visible={picking !== null} onClose={() => setPicking(null)} title={picking === 'to' ? 'Convert to' : 'Convert from'}
        selected={picking === 'to' ? to : from} onPick={code => (picking === 'to' ? setTo(code) : setFrom(code))} />

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing ? `${editing} rate` : ''}>
        <View style={{ gap: 14 }}>
          <Field label={`Pesos for 1 ${editing ?? ''}`} big value={rateText} onChangeText={setRateText} keyboardType="decimal-pad" placeholder="e.g. 58.25" />
          <Toggle label="Keep my rate" hint="Use this number instead of live rates, e.g. the rate your bank actually gave you." value={pin} onChange={setPin} />
          <ErrorText text={error} />
          <Button label="Save" icon="check" onPress={save} />
          {editing && pinned.includes(editing) ? <Button variant="secondary" label="Go back to live rates" onPress={unpinAndReset} /> : null}
        </View>
      </Sheet>
    </Screen>
  );
}
