// Backups: a daily copy inside the app, an optional copy in a folder you pick (e.g. one synced to Google Drive),
// and manual share/restore.
import { Directory, File, Paths } from 'expo-file-system';
import * as Legacy from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { exportAll, importAll, applyPwaImport, setSetting, type DB } from '../db/repo';
import { convertPwaBackup, isPwaBackup } from './importPwa';
import { todayISO } from './money';

const KEEP = 14;
const backupDir = () => new Directory(Paths.document, 'backups');

function backupJson(db: DB) { return JSON.stringify(exportAll(db)); }

export function listLocalBackups(): { name: string; uri: string }[] {
  const dir = backupDir();
  if (!dir.exists) return [];
  return dir.list()
    .filter((f): f is File => f instanceof File && f.name.endsWith('.json'))
    .map(f => ({ name: f.name, uri: f.uri }))
    // Newest first by date; older files are named bahay-YYYY-MM-DD, newer ones cynct-YYYY-MM-DD.
    .sort((a, b) => b.name.replace(/^[a-z]+-/, '').localeCompare(a.name.replace(/^[a-z]+-/, '')));
}

/** Writes today's backup if there isn't one yet. Safe to call on every app open. */
export async function runDailyBackup(db: DB, settings: Record<string, unknown>): Promise<{ wrote: boolean; folderError?: string }> {
  const today = todayISO();
  if (settings.lastAutoBackup === today) return { wrote: false };
  const json = backupJson(db);

  const dir = backupDir();
  dir.create({ idempotent: true, intermediates: true });
  const file = new File(dir, `cynct-${today}.json`);
  if (file.exists) file.delete();
  file.create();
  await file.write(json);
  for (const old of listLocalBackups().slice(KEEP)) new File(old.uri).delete();

  let folderError: string | undefined;
  const folder = settings.backupFolderUri as string | undefined;
  if (folder) {
    try {
      await writeToFolder(folder, `cynct-${today}`, json);
      setSetting(db, 'lastFolderBackup', today);
      setSetting(db, 'folderBackupError', null);
    } catch {
      folderError = 'Couldn’t write to your backup folder. Pick it again in Settings.';
      setSetting(db, 'folderBackupError', today);
    }
  }
  setSetting(db, 'lastAutoBackup', today);
  return { wrote: true, folderError };
}

async function writeToFolder(folderUri: string, baseName: string, json: string) {
  const SAF = Legacy.StorageAccessFramework;
  const existing = await SAF.readDirectoryAsync(folderUri);
  const match = existing.find(u => decodeURIComponent(u).endsWith(`${baseName}.json`));
  const target = match ?? await SAF.createFileAsync(folderUri, baseName, 'application/json');
  await Legacy.writeAsStringAsync(target, json, { encoding: Legacy.EncodingType.UTF8 });
}

/** Ask the user for a folder (Android). Writes a backup there immediately to confirm it works. */
export async function pickBackupFolder(db: DB): Promise<boolean> {
  const res = await Legacy.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!res.granted) return false;
  try { await writeToFolder(res.directoryUri, `cynct-${todayISO()}`, backupJson(db)); }
  catch { throw new Error('That folder doesn’t let apps save files. Pick a folder on your phone instead.'); }
  setSetting(db, 'backupFolderUri', res.directoryUri);
  setSetting(db, 'lastFolderBackup', todayISO());
  setSetting(db, 'folderBackupError', null);
  return true;
}

export async function shareBackup(db: DB) {
  const file = new File(Paths.cache, `cynct-backup-${todayISO()}.json`);
  if (file.exists) file.delete();
  file.create();
  await file.write(backupJson(db));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save Cynct backup' });
  setSetting(db, 'lastManualBackup', Date.now());
}

export async function shareText(db: DB, name: string, text: string, mimeType: string) {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}

export async function pickBackupFile(): Promise<unknown | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return null;
  const text = await new File(res.assets[0].uri).text();
  try { return JSON.parse(text); } catch { throw new Error('That file isn’t a valid backup (not JSON).'); }
}

export async function readLocalBackup(uri: string): Promise<unknown> {
  return JSON.parse(await new File(uri).text());
}

/** Restores either a native backup or a web-app (PWA) backup. Returns a summary for the toast. */
export function restoreFromData(db: DB, data: unknown): string {
  if (isPwaBackup(data)) {
    const p = convertPwaBackup(data);
    applyPwaImport(db, p);
    return `Imported ${p.transactions.length} transactions from the web app${p.skipped ? `, skipped ${p.skipped} invalid` : ''}`;
  }
  const n = importAll(db, data);
  return `Restored ${n} transactions`;
}
