import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import Capture from '../../modules/cynct-capture';
import { useData } from '../data/DataContext';
import { radius, useTheme } from '../theme';
import { Button, Card, Chip, Field, Icon, IconBubble, List, Note, Row, Screen, Section, Sheet, T, Toggle, formatTime } from '../components/ui';
import { addCaptured, payRecurring, setCaptured, setSetting } from '../db/repo';
import { findRecorded, matchPlan } from '../lib/match';
import { APPS, parseCapture, type CaptureRow, type Draft } from '../lib/capture';
import { alreadyKnown, parseMayaScreen, screenToCapture } from '../lib/screenshot';
import { ocrSupported, readText } from '../data/ocr';
import { accessOn, addDraft, captureSupported, draftsFrom, readCapture, resolveDraft, type CapturePrefs } from '../data/capture';
import { convert, money } from '../lib/currency';
import { budgetCrossings, crossingText } from '../lib/budgetAlert';
import type { CatMemory } from '../lib/learn';
import { dayLabel, todayISO } from '../lib/money';

const appName = (id: string | null) => APPS.find(a => a.id === id)?.name ?? id ?? 'another account';
const when = (ms: number) => { const d = new Date(ms); return `${dayLabel(todayISO(d))} · ${formatTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)}`; };

function DraftCard({ d, prefs }: { d: Draft; prefs: CapturePrefs }) {
  const { c } = useTheme();
  const { data, act, rates, cats, curOf, fmt, rtx } = useData();
  const r = resolveDraft(d, prefs, data.accounts, cats, rates, data.settings.catMemory as CatMemory | undefined);
  // Already in Cynct (e.g. Received was tapped first)? Or does it settle a planned payment?
  const dup = r.tx ? findRecorded(r.tx, data.transactions) : null;
  const planRow = (() => {
    if (dup || !r.tx) return null;
    const plans = data.recurring.map(x => ({ ...x, currency: curOf(x.accountId) }));
    const m = matchPlan({ kind: d.kind, amount: d.amount, currency: d.currency, postedAt: d.postedAt, accountId: r.accountId }, plans, rates);
    return m ? data.recurring.find(x => x.id === m.id) ?? null : null;
  })();
  const settle = () => {
    if (!planRow || !r.tx) return;
    const debt = planRow.debtId ? data.debts.find(x => x.id === planRow.debtId) ?? null : null;
    act(db => { const t = payRecurring(db, planRow, r.tx!.date, r.tx!.amount, debt); setCaptured(db, d.ids, 'added', t.id); },
      `${planRow.name}: ${fmt(r.tx.amount, planRow.accountId)} ${planRow.kind === 'income' ? 'received' : 'paid'}`);
  };
  const acc = (id: string | null) => data.accounts.find(a => a.id === id)?.name ?? null;
  const color = d.kind === 'income' ? c.income : d.kind === 'transfer' ? c.info : c.spend;
  const icon = d.kind === 'income' ? 'arrow-down' : d.kind === 'transfer' ? 'swap-horizontal' : 'arrow-up';
  const where = d.kind === 'transfer' ? `${acc(r.fromId) ?? appName(d.fromApp)} → ${acc(r.toId) ?? appName(d.toApp)}` : acc(r.accountId) ?? appName(d.app);
  const cat = r.categoryId ? data.categories.find(x => x.id === r.categoryId)?.name : null;
  const date = todayISO(new Date(d.postedAt));
  const time = (() => { const t = new Date(d.postedAt); return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; })();

  const edit = (asTransfer = false) => {
    const ids = d.ids.join(',');
    if (d.kind === 'transfer' || asTransfer) {
      const fromId = asTransfer ? null : r.fromId, toId = asTransfer ? r.accountId : r.toId;
      const fromCur = data.accounts.find(a => a.id === fromId)?.currency;
      const toCur = data.accounts.find(a => a.id === toId)?.currency;
      router.push({ pathname: '/transfer/[id]', params: { id: 'new', from: fromId ?? '', to: toId ?? '', note: d.note, date, time, capture: ids,
        amount: !fromId || fromCur === d.currency ? String(d.amount / 100) : '', received: toCur === d.currency && fromCur && fromCur !== toCur ? String(d.amount / 100) : '' } });
      return;
    }
    router.push({ pathname: '/tx/[id]', params: { id: 'new', type: d.kind, amount: String(d.amount / 100), currency: d.currency, note: d.note, date, time,
      account: r.accountId ?? '', category: r.categoryId ?? '', capture: ids } });
  };

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <IconBubble icon={icon} color={color} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="semi" numberOfLines={1}>{d.note}</T>
          <T v="small" numberOfLines={1}>{`${where}${cat ? ` · ${cat}` : ''}`}</T>
        </View>
        <T v="num" color={d.kind === 'income' ? c.income : c.ink}>{`${d.kind === 'income' ? '+' : d.kind === 'expense' ? '−' : ''}${money(d.amount, d.currency)}`}</T>
      </View>
      <T v="small">{when(d.postedAt)}</T>
      {dup ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: c.infoSoft, borderRadius: radius.md, padding: 10 }}>
          <Icon name="content-duplicate" size={18} color={c.info} />
          <T v="small" color={c.inkSoft} style={{ flex: 1 }}>{`Already in Cynct: ${dup.note || 'an entry'} on ${dayLabel(dup.date)}, same amount. Dismiss this one unless it really happened twice.`}</T>
        </View>
      ) : planRow ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: c.incomeSoft, borderRadius: radius.md, padding: 10 }}>
          <Icon name="calendar-check" size={18} color={c.income} />
          <T v="small" color={c.inkSoft} style={{ flex: 1 }}>{`Looks like ${planRow.name}, due ${dayLabel(planRow.nextDue)}. Marking it ${planRow.kind === 'income' ? 'received' : 'paid'} records this amount and moves the plan to its next date.`}</T>
        </View>
      ) : null}
      {d.check || r.missing ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: c.warnSoft, borderRadius: radius.md, padding: 10 }}>
          <Icon name="alert-circle-outline" size={18} color={c.warn} />
          <T v="small" color={c.inkSoft} style={{ flex: 1 }}>{[d.check, r.missing && r.missing !== 'Pick the other account' ? `${r.missing}.` : null].filter(Boolean).join(' ')}</T>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {dup ? <Button small icon="close" label="Dismiss" onPress={() => act(db => setCaptured(db, d.ids, 'dismissed'), 'Dismissed')} style={{ flexGrow: 1 }} />
          : planRow ? <Button small icon="calendar-check" label={planRow.kind === 'income' ? 'Mark received' : 'Mark paid'} onPress={settle} style={{ flexGrow: 1 }} /> : null}
        <Button small variant={dup || planRow ? 'secondary' : 'primary'} icon="check" label={dup || planRow ? 'Add as new' : 'Add'} disabled={!r.tx} onPress={() => {
          if (!r.tx) return;
          const crossed = r.tx.type === 'expense' ? budgetCrossings(data.budgets, rtx, cats, { categoryId: r.tx.categoryId, amount: convert(r.tx.amount, curOf(r.tx.accountId), 'PHP', rates) ?? r.tx.amount, date: r.tx.date }, todayISO())[0] : undefined;
          act(db => addDraft(db, d, r.tx!), crossed ? crossingText(crossed, v => fmt(v, null)) : `${d.kind === 'transfer' ? 'Transfer' : d.kind === 'income' ? 'Income' : 'Expense'} added`);
        }} style={{ flexGrow: 1 }} />
        <Button small variant="secondary" icon="pencil-outline" label="Edit" onPress={() => edit()} style={{ flexGrow: 1 }} />
        {d.kind === 'income' && d.check ? <Button small variant="secondary" icon="swap-horizontal" label="Transfer" onPress={() => edit(true)} /> : null}
        {!dup ? <Button small variant="ghost" icon="close" label="Dismiss" onPress={() => act(db => setCaptured(db, d.ids, 'dismissed'), 'Dismissed')} /> : null}
      </View>
    </Card>
  );
}

export default function CaptureScreen() {
  const { c } = useTheme();
  const { data, act, toast } = useData();
  const prefs = readCapture(data.settings);
  const [reading, setReading] = useState<string | null>(null);

  // Payments that never sent a notification: read Maya's transaction screens from screenshots.
  const importShots = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 30, quality: 1 });
    if (res.canceled || !res.assets.length) return;
    const rows: CaptureRow[] = [];
    let dup = 0, unread = 0;
    for (const [i, a] of res.assets.entries()) {
      setReading(`Reading ${i + 1} of ${res.assets.length}…`);
      try {
        const s = parseMayaScreen(await readText(a.uri));
        const row = s ? screenToCapture(s) : null;
        const p = row ? parseCapture(row) : null;
        if (!row || !p) { unread++; continue; }
        if (alreadyKnown(p, [...data.captured, ...rows], data.transactions)) { dup++; continue; }
        rows.push(row);
      } catch { unread++; }
    }
    setReading(null);
    const parts = [rows.length ? `${rows.length} to review` : null, dup ? `${dup} already in Cynct` : null, unread ? `${unread} couldn’t be read` : null].filter(Boolean);
    if (rows.length) act(db => { addCaptured(db, rows); }, parts.join(' · '));
    else toast(parts.join(' · ') || 'Nothing found');
  };
  const [, tick] = useState(0);
  const [linking, setLinking] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [tail, setTail] = useState('');
  const on = accessOn();
  const save = (patch: Partial<CapturePrefs>, msg?: string) => act(db => setSetting(db, 'capture', { ...prefs, ...patch }), msg);

  // Coming back from Android settings: re-check whether access was granted.
  useEffect(() => { const s = AppState.addEventListener('change', st => { if (st === 'active') tick(x => x + 1); }); return () => s.remove(); }, []);

  const { drafts, unread } = draftsFrom(data.captured, prefs);
  const live = data.accounts.filter(a => !a.archived);
  const linkedNames = (app: string) => {
    const ids = prefs.links[app] ?? [];
    const names = ids.map(id => live.find(a => a.id === id)?.name).filter(Boolean);
    if (names.length) return names.join(', ');
    const guess = live.filter(a => a.name.toLowerCase().replace(/[^a-z]/g, '').includes(appName(app).toLowerCase())).map(a => a.name);
    return guess.length ? `${guess.join(', ')} (matched by name)` : 'Not linked';
  };

  return (
    <Screen title="Payment capture" subtitle="Turns Maya, Wise and GoTyme notifications into transactions for you to confirm." back>
      {!captureSupported ? (
        <Note icon="cellphone-off">This works on the Android app only. It reads notifications on your phone.</Note>
      ) : (
        <Card style={{ gap: 12 }}>
          <Toggle label="Capture payments" hint="Reads only notifications from the apps below. Nothing leaves your phone." value={prefs.enabled}
            onChange={(v) => { save({ enabled: v }, v ? 'Payment capture on' : 'Payment capture off'); if (v && !on) Capture.openSettings(); }} />
          {prefs.enabled ? (
            on ? (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Icon name="check-circle" size={18} color={c.income} />
                <T v="medium" style={{ flex: 1 }}>Notification access is on.</T>
              </View>
            ) : (
              <>
                <Note tone="warn" icon="bell-off-outline">Android needs you to allow notification access for Cynct once. Find Cynct in the list and switch it on.</Note>
                <Button icon="open-in-new" label="Open notification access" onPress={() => Capture.openSettings()} />
              </>
            )
          ) : null}
        </Card>
      )}

      {ocrSupported ? (
        <Card style={{ gap: 10, marginTop: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <IconBubble icon="cellphone-screenshot" color={c.info} size={40} />
            <View style={{ flex: 1 }}>
              <T v="semi">Missed a Maya payment?</T>
              <T v="small">Pick screenshots of Maya’s transaction screens. They’re read on this phone and added below for you to check.</T>
            </View>
          </View>
          {reading ? (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><ActivityIndicator color={c.mango} /><T v="medium">{reading}</T></View>
          ) : <Button variant="secondary" icon="image-multiple-outline" label="Import screenshots" onPress={importShots} />}
        </Card>
      ) : null}

      <Section title="To review" aside={drafts.length ? String(drafts.length) : undefined}>
        {drafts.length ? <View style={{ gap: 12 }}>{drafts.map(d => <DraftCard key={d.id} d={d} prefs={prefs} />)}</View>
          : <T v="muted">{prefs.enabled ? 'Nothing new. Payments show up here after the notification arrives and you open Cynct.' : 'Turn on capture to start.'}</T>}
      </Section>

      {unread.length ? (
        <Section title="Couldn’t read" aside={String(unread.length)}>
          <T v="small" style={{ marginBottom: 10 }}>These looked like payments but the wording was new. Send a screenshot and the rules can learn it.</T>
          <List>{unread.slice(0, 10).map(u => (
            <Row key={u.id} icon="help-circle-outline" title={u.title || appName(u.app)} sub={u.text}
              right={<Pressable onPress={() => act(db => setCaptured(db, [u.id], 'dismissed'))} hitSlop={8} accessibilityLabel="Dismiss"><Icon name="close" color={c.faint} /></Pressable>} />
          ))}</List>
        </Section>
      ) : null}

      <Section title="Apps and accounts">
        <List>{APPS.map(a => (
          <Row key={a.id} icon="link-variant" iconColor={c.info} title={a.name} sub={linkedNames(a.id)} chevron onPress={() => setLinking(a.id)} />
        ))}</List>
        <T v="small" style={{ marginTop: 8 }}>Link every account an app holds. Wise money goes to the linked account in the same currency.</T>
      </Section>

      <Section title="That’s you">
        <Card style={{ gap: 12 }}>
          <T v="small">Money from or to these names and account numbers is moving between your own accounts, so it becomes a transfer instead of income or spending.</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {prefs.names.map(n => <Chip key={n} label={`${n}  ✕`} onPress={() => save({ names: prefs.names.filter(x => x !== n) })} />)}
            {prefs.tails.map(t => <Chip key={t} label={`••${t}  ✕`} onPress={() => save({ tails: prefs.tails.filter(x => x !== t) })} />)}
          </View>
          <Field label="Your name as banks show it" value={name} onChangeText={setName} placeholder="e.g. J. E. B. Buico" autoCapitalize="words"
            onSubmitEditing={() => { if (name.trim()) { save({ names: [...new Set([...prefs.names, name.trim()])] }); setName(''); } }} returnKeyType="done" />
          <Field label="Last 4 digits of your own account or number" value={tail} onChangeText={(v) => setTail(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" maxLength={4} placeholder="e.g. 3797" />
          <Button small variant="secondary" icon="plus" label="Add" disabled={!name.trim() && tail.length < 3}
            onPress={() => { save({ names: name.trim() ? [...new Set([...prefs.names, name.trim()])] : prefs.names, tails: tail.length >= 3 ? [...new Set([...prefs.tails, tail])] : prefs.tails }, 'Saved'); setName(''); setTail(''); }} />
        </Card>
      </Section>

      <View style={{ marginTop: 18, backgroundColor: c.sunk, borderRadius: radius.md, padding: 12, gap: 6 }}>
        <T v="small">Android lets apps with notification access see every notification. Cynct throws away anything that isn’t from Maya, Wise, GoTyme or GCash before it’s saved, keeps the rest on this phone, and forgets handled ones after 60 days. Backups don’t include them.</T>
        <T v="small">If a payment notification never appears (notifications off for that app, or cleared before Cynct opened), add it by hand.</T>
      </View>

      <Sheet visible={!!linking} onClose={() => setLinking(null)} title={`${appName(linking)} accounts`}>
        <View style={{ gap: 4 }}>
          {live.map(a => {
            const ids = prefs.links[linking ?? ''] ?? [];
            const sel = ids.includes(a.id);
            return (
              <Row key={a.id} title={a.name} sub={a.currency} selected={sel} icon="wallet-outline"
                onPress={() => linking && save({ links: { ...prefs.links, [linking]: sel ? ids.filter(x => x !== a.id) : [...ids, a.id] } })} />
            );
          })}
        </View>
      </Sheet>
    </Screen>
  );
}
