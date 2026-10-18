import { Platform } from 'react-native';
import { openDatabaseAsync, openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from './migrations';
import { schema } from './schema';
import type { DB } from './repo';

// The file keeps its original name: renaming it would hide everyone’s existing data.
export const DB_NAME = 'bahay.db';

/**
 * On Android this does nothing. On web (used only for previews), the SQLite worker must start
 * before the synchronous API works, so open it once asynchronously first.
 */
export async function prepareDb() {
  if (Platform.OS !== 'web') return;
  const warm = await openDatabaseAsync(DB_NAME);
  await warm.getFirstAsync('SELECT 1');
}

let cached: { db: DB; close: () => void } | null = null;

export function openDb() {
  if (cached) return cached;
  const sqlite = openDatabaseSync(DB_NAME);
  sqlite.execSync('PRAGMA journal_mode = WAL;');
  migrate({
    getUserVersion: () => sqlite.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0,
    exec: (sql) => sqlite.execSync(sql),
    setUserVersion: (v) => sqlite.execSync(`PRAGMA user_version = ${v}`),
    transaction: (fn) => sqlite.withTransactionSync(fn),
  });
  const db = drizzle(sqlite, { schema }) as unknown as DB;
  cached = { db, close: () => sqlite.closeSync() };
  return cached;
}
