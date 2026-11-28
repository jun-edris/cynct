// The short setup right after Welcome. Each step fixes something that quietly breaks later if it's missed:
// no accounts (start empty only), no notification access (nothing syncs), no backup folder (a lost phone
// loses everything). Every step can be skipped. If the app closes halfway, it opens here again.
import React, { useEffect, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Capture from '../../modules/cynct-capture';
import { useData } from '../data/DataContext';
import { fonts, radius, space, useTheme } from '../theme';
import { Field, Icon, IconBubble, Note, T } from '../components/ui';
import { GradButton, NightGradient, SentiBadge, SheetUp } from '../components/k';
import { setSetting, upsert } from '../db/repo';
import { accessOn, captureSupported, readCapture } from '../data/capture';
import { pickBackupFolder } from '../lib/backup';
import { APPS } from '../lib/capture';
import { PRESETS, buildAccounts, defaultAccount, readSetupPath, setupSteps, type PickedAccount, type SetupStep } from '../lib/setup';
import { toCentavos } from '../lib/money';

const COPY: Record<SetupStep, { title: string; why: string }> = {
  accounts: { title: 'Where do you keep money?', why: 'Tap the ones you use and put in what’s in each today. You can add more later in Wallet.' },
  capture: { title: 'Let payments log themselves', why: 'When GCash, Maya, Wise or GoTyme notifies you about a payment, Cynct turns it into an entry for you to confirm. Without this, you type everything by hand.' },
  backup: { title: 'Keep a copy, just in case', why: 'Cynct keeps everything on this phone, not online. Pick a folder and it saves a backup there every day, so a lost or reset phone doesn’t mean starting over.' },
};

export default function Setup() {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const { data, act, toast } = useData();
  const path = readSetupPath(data.settings.setupPending) ?? 'starter';
  const steps = setupSteps(path);
  const [i, setI] = useState(0);
  const step = steps[Math.min(i, steps.length - 1)];
  const [picked, setPicked] = useState<(PickedAccount & { key: string; amount: string })[]>([]);

  const done = () => {
    act(db => setSetting(db, 'setupPending', null));
    toast('You’re all set');
    router.replace('/');
  };
  const next = () => (i + 1 < steps.length ? setI(i + 1) : done());

  const saveAccounts = () => {
    const rows = picked.map(p => ({ ...p, opening: toCentavos(p.amount || '0') }));
    if (!rows.some(r => r.name.trim())) { next(); return; }
    const { accounts, links } = buildAccounts(rows, data.accounts.length);
    const prefs = readCapture(data.settings);
    const merged = { ...prefs.links };
    for (const [app, ids] of Object.entries(links)) merged[app] = [...new Set([...(merged[app] ?? []), ...(ids ?? [])])];
    const def = defaultAccount(accounts);
    if (act(db => {
      for (const a of accounts) upsert.account(db, a);
      setSetting(db, 'capture', { ...prefs, links: merged });
      if (def && !data.settings.defaultAccountId) setSetting(db, 'defaultAccountId', def);
    }, `${accounts.length} account${accounts.length === 1 ? '' : 's'} added`)) next();
  };

  const primary = step === 'accounts'
    ? { label: picked.length ? `Add ${picked.length} account${picked.length === 1 ? '' : 's'}` : 'Next', run: saveAccounts }
    : { label: i + 1 < steps.length ? 'Next' : 'Finish', run: next };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <NightGradient style={{ paddingTop: insets.top + 16, paddingHorizontal: space.page, paddingBottom: 46 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: 6 }} accessibilityLabel={`Step ${i + 1} of ${steps.length}`}>
            {steps.map((s, k) => <View key={s} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: k <= i ? '#FFFFFF' : 'rgba(255,255,255,0.25)' }} />)}
          </View>
          <Pressable onPress={done} hitSlop={10} accessibilityRole="button" accessibilityLabel="Skip setup">
            <T v="semi" color="#E7E0FF" style={{ fontSize: 14 }}>Skip setup</T>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 20 }}>
          <SentiBadge size={52} />
          <View style={{ flex: 1, gap: 6 }}>
            <T v="label" color="#FFB020">{`Step ${i + 1} of ${steps.length}`}</T>
            <T v="title" color="#FFFFFF" style={{ fontSize: 28, lineHeight: 32 }}>{COPY[step].title}</T>
          </View>
        </View>
        <T v="medium" color="#E7E0FF" style={{ marginTop: 10, fontSize: 15, lineHeight: 22 }}>{COPY[step].why}</T>
      </NightGradient>

      <SheetUp style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space.page, paddingBottom: 24, gap: 14 }} keyboardShouldPersistTaps="handled">
          {step === 'accounts' ? <AccountsStep picked={picked} setPicked={setPicked} /> : null}
          {step === 'capture' ? <CaptureStep /> : null}
          {step === 'backup' ? <BackupStep /> : null}
        </ScrollView>
        <View style={{ paddingHorizontal: space.page, paddingTop: 10, paddingBottom: insets.bottom + 12, gap: 6, borderTopWidth: 1, borderColor: c.line }}>
          <GradButton label={primary.label} onPress={primary.run} />
          <Pressable onPress={next} hitSlop={8} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 10 }}>
            <T v="semi" color={c.muted}>{step === 'accounts' && picked.length ? 'Skip, I’ll add them later' : 'Skip for now'}</T>
          </Pressable>
        </View>
      </SheetUp>
    </View>
  );
}

function AccountsStep({ picked, setPicked }: { picked: (PickedAccount & { key: string; amount: string })[]; setPicked: React.Dispatch<React.SetStateAction<(PickedAccount & { key: string; amount: string })[]>> }) {
  const { c } = useTheme();
  const has = (name: string) => picked.some(p => p.key === name);
  const toggle = (name: string) => {
    const pre = PRESETS.find(p => p.name === name)!;
    setPicked(ps => has(name) ? ps.filter(p => p.key !== name) : [...ps, { ...pre, key: name, opening: 0, amount: '' }]);
  };
  const addOther = () => setPicked(ps => [...ps, { key: `other${Date.now()}`, name: '', type: 'bank', color: '#8B6CFF', opening: 0, amount: '' }]);
  const set = (key: string, patch: Partial<{ name: string; amount: string }>) => setPicked(ps => ps.map(p => (p.key === key ? { ...p, ...patch } : p)));

  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {PRESETS.map(p => {
          const on = has(p.name);
          return (
            <Pressable key={p.name} onPress={() => toggle(p.name)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={p.name}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 14, borderRadius: 23,
                backgroundColor: on ? c.ink : c.surface, borderWidth: 1, borderColor: on ? c.ink : c.line, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.color }} />
              <T v="semi" color={on ? c.bg : c.ink}>{p.name}</T>
              {on ? <Icon name="check" size={16} color={c.bg} /> : null}
            </Pressable>
          );
        })}
        <Pressable onPress={addOther} accessibilityRole="button" accessibilityLabel="Another account"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 46, paddingHorizontal: 14, borderRadius: 23, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.line }}>
          <Icon name="plus" size={18} color={c.muted} /><T v="semi" color={c.muted}>Another</T>
        </Pressable>
      </View>

      {picked.length ? <T v="h3" style={{ marginTop: 6 }}>How much is in each today?</T> : null}
      {picked.map(p => (
        <View key={p.key} style={{ backgroundColor: c.surface, borderRadius: radius.lg, padding: 12, gap: 10, borderWidth: 1, borderColor: c.line }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: p.color }} />
            {PRESETS.some(x => x.name === p.key) ? <T v="semi" style={{ flex: 1 }}>{p.name}</T> : (
              <TextInput value={p.name} onChangeText={v => set(p.key, { name: v })} placeholder="Account name, e.g. Metrobank" placeholderTextColor={c.faint}
                accessibilityLabel="Account name" style={{ flex: 1, minHeight: 40, fontFamily: fonts.semi, fontSize: 16, color: c.ink }} />
            )}
            <Pressable onPress={() => setPicked(ps => ps.filter(x => x.key !== p.key))} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${p.name || 'account'}`}>
              <Icon name="close" size={20} color={c.muted} />
            </Pressable>
          </View>
          <Field label="Balance now" value={p.amount} onChangeText={v => set(p.key, { amount: v })} keyboardType="decimal-pad" prefix="₱" placeholder="0"
            hint={p.app ? `Open ${p.name} and copy the balance shown there.` : undefined} />
        </View>
      ))}
      {!picked.length ? <T v="small">Not sure? Start with the app you pay with most. Balances can be fixed any time.</T> : null}
    </>
  );
}

function CaptureStep() {
  const { c } = useTheme();
  const { data, act } = useData();
  const prefs = readCapture(data.settings);
  const [on, setOn] = useState(() => accessOn());
  // Coming back from Android's settings screen: check again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s === 'active') setOn(accessOn()); });
    return () => sub.remove();
  }, []);
  const turnOn = () => {
    act(db => setSetting(db, 'capture', { ...prefs, enabled: true }));
    if (!accessOn()) Capture.openSettings();
    else setOn(true);
  };
  const ready = on && prefs.enabled;

  return (
    <>
      {[
        ['bell-ring-outline', 'Reads only payment notifications from these apps', APPS.map(a => a.name).join(', ')],
        ['cellphone-lock', 'Stays on this phone', 'Nothing is uploaded. Everything else is thrown away before it’s saved.'],
        ['check-decagram-outline', 'You confirm each one', 'Nothing is added until you tap Add.'],
      ].map(([icon, title, sub]) => (
        <View key={title} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <IconBubble icon={icon} color={c.mango} size={40} />
          <View style={{ flex: 1 }}><T v="semi">{title}</T><T v="small">{sub}</T></View>
        </View>
      ))}
      {!captureSupported ? <Note icon="cellphone-off">This works in the Android app. You can turn it on later in Settings.</Note>
        : ready ? (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.incomeSoft, borderRadius: radius.lg, padding: 14 }}>
            <Icon name="check-circle" size={24} color={c.income} />
            <T v="semi" style={{ flex: 1 }}>Notification access is on. Payments will show up for you to confirm.</T>
          </View>
        ) : (
          <View style={{ gap: 10, backgroundColor: c.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: c.line }}>
            <T v="semi">Two taps:</T>
            <T v="medium">{'1. Tap the button below. Your phone opens its notification access list.\n2. Find Cynct, switch it on, then come back here.'}</T>
            <GradButton label={prefs.enabled ? 'Open notification access' : 'Turn on payment capture'} onPress={turnOn} />
          </View>
        )}
    </>
  );
}

function BackupStep() {
  const { c } = useTheme();
  const { db, data, reload, toast } = useData();
  const folder = data.settings.backupFolderUri as string | undefined;
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    setBusy(true);
    try { if (await pickBackupFolder(db)) { reload(); toast('Backup folder set and backed up'); } }
    catch (e) { toast(e instanceof Error ? e.message : 'Couldn’t use that folder.'); }
    setBusy(false);
  };
  const name = folder ? decodeURIComponent(folder.split('%3A').pop() ?? '') || 'your folder' : null;

  return (
    <>
      {[
        ['calendar-sync', 'Every day, by itself', 'The first time you open Cynct each day, it saves a copy.'],
        ['broom', 'Old copies clean up', 'Backups older than a month are deleted, so the folder doesn’t fill up.'],
        ['google-drive', 'Want it off the phone too?', 'Pick a folder your Google Drive or Files app syncs, or use Save to Drive in Settings now and then.'],
      ].map(([icon, title, sub]) => (
        <View key={title} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <IconBubble icon={icon} color={c.info} size={40} />
          <View style={{ flex: 1 }}><T v="semi">{title}</T><T v="small">{sub}</T></View>
        </View>
      ))}
      {Platform.OS !== 'android' ? <Note icon="cellphone-off">Folder backups work in the Android app. You can set this later in Settings.</Note>
        : name ? (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.incomeSoft, borderRadius: radius.lg, padding: 14 }}>
            <Icon name="check-circle" size={24} color={c.income} />
            <View style={{ flex: 1 }}><T v="semi">Backing up daily</T><T v="small">{`To ${name}. The first backup is already there.`}</T></View>
          </View>
        ) : (
          <View style={{ gap: 10, backgroundColor: c.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: c.line }}>
            <T v="medium">Tip: make a new folder called “Cynct backups” in Documents, then tap “Use this folder”.</T>
            <GradButton label={busy ? 'Saving the first backup…' : 'Pick a backup folder'} onPress={busy ? undefined : pick} disabled={busy} />
          </View>
        )}
    </>
  );
}
