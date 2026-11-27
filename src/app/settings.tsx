import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useData } from '../data/DataContext';
import { useTheme } from '../theme';
import { KHeader, KSheet, OnNight } from '../components/k';
import { Button, Card, Icon, List, Row, Screen, Section, Segmented, Select, Sheet, T, Toggle } from '../components/ui';
import { useAccountOptions } from '../components/domain';
import { canUseBiometrics } from '../components/LockGate';
import { setSetting, wipeAll } from '../db/repo';
import { listLocalBackups, pickBackupFile, pickBackupFolder, readLocalBackup, restoreFromData, runDailyBackup, shareBackup, shareText } from '../lib/backup';
import { toCSV } from '../lib/ledger';
import { todayISO } from '../lib/money';

type Confirm = { title: string; text: string; action: string; run: () => void } | null;

export default function Settings() {
  const { c } = useTheme();
  const { db, data, act, toast, reload } = useData();
  const [backups, setBackups] = useState(() => { try { return listLocalBackups(); } catch { return []; } });
  const [confirm, setConfirm] = useState<Confirm>(null);
  const accountOptions = [{ value: '', label: 'None', icon: 'minus' }, ...useAccountOptions()];
  const folder = data.settings.backupFolderUri as string | undefined;
  const lastManual = data.settings.lastManualBackup as number | undefined;
  const theme = ((data.settings.theme as string) ?? 'system') as 'system' | 'light' | 'dark';

  const toggleLock = async (on: boolean) => {
    if (on) {
      const problem = await canUseBiometrics();
      if (problem) { toast(problem); return; }
    }
    act(d => setSetting(d, 'lockEnabled', on), on ? 'Lock turned on' : 'Lock turned off');
  };

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); reload(); if (ok) toast(ok); setBackups(listLocalBackups()); }
    catch (e) { toast(e instanceof Error ? e.message : 'Something went wrong.'); }
  };

  const askRestore = (dataObj: unknown, label: string) => setConfirm({
    title: 'Replace everything?', text: `All data on this phone will be replaced with ${label}. This can’t be undone.`, action: 'Replace',
    run: () => { try { const msg = restoreFromData(db, dataObj); reload(); toast(msg); } catch (e) { toast(e instanceof Error ? e.message : 'Restore failed.'); } },
  });

  const askErase = () => setConfirm({
    title: 'Erase all data?', text: 'Deletes every account, entry, plan and goal on this phone. Backup files are kept.', action: 'Erase everything',
    run: () => { if (act(d => wipeAll(d), 'All data erased')) router.replace('/welcome'); },
  });

  return (
    <Screen headerless edge padBottom={40}>
      <KHeader title="Settings" back>
        <OnNight style={{ marginTop: 8 }}>Look, reminders, backups and your data.</OnNight>
      </KHeader>
      <KSheet>
      <Section title="Appearance" style={{ marginTop: 0 }}>
        <Segmented value={theme} onChange={(v) => act(d => setSetting(d, 'theme', v))} options={[['system', 'Phone', 'cellphone'], ['light', 'Light', 'white-balance-sunny'], ['dark', 'Dark', 'weather-night']]} />
      </Section>

      <Section title="Personalize">
        <List>
          <Row icon="bell-outline" iconColor={c.mango} title="Reminders" sub={(data.settings.notify as { enabled?: boolean } | undefined)?.enabled ? 'On' : 'Off'} chevron onPress={() => router.push('/notifications')} />
          <Row icon="view-dashboard-edit-outline" iconColor={c.info} title="Home layout" sub="Show, hide and reorder sections" chevron onPress={() => router.push('/home-layout')} />
          <Row icon="bell-badge-outline" iconColor="#8B6CFF" title="Payment capture" sub={(data.settings.capture as { enabled?: boolean } | undefined)?.enabled ? 'On' : 'Maya, Wise, GoTyme notifications'} chevron onPress={() => router.push('/capture')} />
          <Row icon="cash-fast" iconColor="#2EC4B6" title="Paycheck plan" sub="Split a pay into bills, goals and free money" chevron onPress={() => router.push('/paycheck')} />
        </List>
        <View style={{ marginTop: 10 }}>
          <Select label="Ask “Worth it?” after spends of" value={String(data.settings.worthMin ?? 300)}
            options={['0', '100', '300', '500', '1000', '999999'].map(v => ({ value: v, label: v === '0' ? 'Every spend' : v === '999999' ? 'Never' : `₱${Number(v).toLocaleString('en-PH')} or more` }))}
            onChange={(v) => act(d => setSetting(d, 'worthMin', Number(v)))} />
        </View>
      </Section>

      <Section title="Reports">
        <List>
          <Row icon="play-circle-outline" iconColor={c.mango} title="Your recap" sub="Last month and this year: top categories, biggest moments, money style" chevron onPress={() => router.push('/recap')} />
          <Row icon="file-pdf-box" iconColor={c.spend} title="Monthly statement" sub="Export a month as a PDF" chevron onPress={() => router.push('/statement')} />
          <Row icon="file-document-outline" iconColor={c.info} title="Invoices" sub="Bill clients and export PDFs" chevron onPress={() => router.push('/invoices')} />
        </List>
      </Section>

      <Section title="Security">
        <Card>
          <Toggle label="Lock with fingerprint or face" hint="Asks when you open the app and after a minute away. Falls back to your phone PIN."
            value={data.settings.lockEnabled === true} onChange={toggleLock} />
        </Card>
      </Section>

      <Section title="Backups">
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Icon name={folder ? 'cloud-check-outline' : 'cloud-alert-outline'} size={28} color={folder ? c.income : c.warn} />
            <View style={{ flex: 1 }}>
              <T v="semi">{folder ? decodeURIComponent(folder.split('%3A').pop() ?? 'Folder set') : 'No backup folder yet'}</T>
              <T v="small">Inside the app: {(data.settings.lastAutoBackup as string) ?? 'not yet'}{folder ? ` · folder: ${(data.settings.lastFolderBackup as string) ?? 'not yet'}` : ''}{lastManual ? ` · sent out ${new Date(lastManual).toLocaleDateString('en-PH', { dateStyle: 'medium' })}` : ''}</T>
            </View>
          </View>
          {folder && data.settings.folderBackupError ? (
            <T v="small" color={c.spend}>{`The last copy to your folder failed (${data.settings.folderBackupError as string}). Pick the folder again.`}</T>
          ) : null}
          <T v="small">Every day you open Cynct, a backup is saved inside the app and, once you pick one, to a folder on your phone (for example Documents › Cynct). The folder copy survives an uninstall. Backups older than 30 days are deleted from both places; the newest 3 are always kept. To get a copy into Google Drive, tap “Save to Drive”, choose Drive, then tap Save.</T>
          <Button icon="folder-outline" label={folder ? 'Change folder' : 'Pick backup folder'} onPress={() => run(async () => { if (!(await pickBackupFolder(db))) throw new Error('No folder picked.'); }, 'Backup folder set and backed up')} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button small variant="secondary" icon="content-save-outline" label="Back up now" style={{ flex: 1 }}
              onPress={() => run(async () => {
                setSetting(db, 'lastAutoBackup', null);
                const r = await runDailyBackup(db, { ...data.settings, lastAutoBackup: null });
                // Don't say "Backed up" when the folder copy failed; the in-app copy still saved.
                if (r.folderError) throw new Error(`Saved inside the app, but not to your folder. ${r.folderError}`);
              }, 'Backed up')} />
            <Button small variant="secondary" icon="google-drive" label="Save to Drive" style={{ flex: 1 }} onPress={() => run(() => shareBackup(db))} />
          </View>
        </Card>
      </Section>

      <Section title="Restore">
        <List>
          <Row icon="file-upload-outline" iconColor={c.info} title="Restore from a file" sub="Cynct backups, including ones from when it was called Bahay" chevron
            onPress={() => run(async () => { const d = await pickBackupFile(); if (d) askRestore(d, 'that backup'); })} />
          {backups.slice(0, 7).map(b => (
            <Row key={b.uri} icon="history" iconColor={c.muted} title={b.name.replace(/^[a-z]+-/, '').replace('.json', '')} sub="Daily backup on this phone" chevron
              onPress={() => run(async () => askRestore(await readLocalBackup(b.uri), `the ${b.name} backup`))} />
          ))}
        </List>
      </Section>

      <Section title="Data">
        <List>
          <Row icon="file-delimited-outline" iconColor={c.income} title="Export transactions (CSV)" sub="Opens in Sheets or Excel" chevron
            onPress={() => run(() => shareText(db, `cynct-transactions-${todayISO()}.csv`,
              toCSV(data.transactions, new Map(data.accounts.map(a => [a.id, a.name])), new Map(data.categories.map(x => [x.id, x.name]))), 'text/csv'))} />
          <Row icon="shape-outline" iconColor="#2EC4B6" title="Categories" chevron onPress={() => router.push('/categories')} />
          <Row icon="delete-clock-outline" iconColor={c.warn} title="Recently deleted" sub={`${data.deleted.length} item${data.deleted.length === 1 ? '' : 's'}`} chevron onPress={() => router.push('/deleted')} />
        </List>
        <View style={{ marginTop: 12 }}>
          <Select label="Default account for new entries" value={(data.settings.defaultAccountId as string) ?? ''} options={accountOptions}
            onChange={(v) => act(d => setSetting(d, 'defaultAccountId', v || null), 'Default account updated')} />
        </View>
      </Section>

      <Section title="Danger zone">
        <Button variant="danger" icon="delete-forever-outline" label="Erase all data" onPress={askErase} />
      </Section>
      <T v="small" style={{ textAlign: 'center', marginTop: 24 }}>Cynct {Constants.expoConfig?.version ?? ''} · Your data stays on this phone.</T>

      <Sheet visible={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title}>
        <View style={{ gap: 12 }}>
          <T v="muted">{confirm?.text}</T>
          <Button variant="danger" label={confirm?.action ?? 'Confirm'} onPress={() => { const f = confirm?.run; setConfirm(null); f?.(); }} />
          <Button variant="secondary" label="Cancel" onPress={() => setConfirm(null)} />
        </View>
      </Sheet>
      </KSheet>
    </Screen>
  );
}
