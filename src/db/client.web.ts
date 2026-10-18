// Web build only (browser preview / screenshots). Uses an in-memory sql.js database: nothing persists.
// The Android app uses client.ts with expo-sqlite.
import initSqlJs, { type Database } from 'sql.js';
import { drizzle } from 'drizzle-orm/sql-js';
import { migrate } from './migrations';
import { schema } from './schema';
import type { DB } from './repo';

export const DB_NAME = 'bahay.db';
let sqlite: Database | null = null;
let cached: { db: DB; close: () => void } | null = null;

export async function prepareDb() {
  if (sqlite) return;
  const SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' });
  sqlite = new SQL.Database();
}

export function openDb() {
  if (cached) return cached;
  if (!sqlite) throw new Error('prepareDb() must run first');
  const s = sqlite;
  migrate({
    getUserVersion: () => Number(s.exec('PRAGMA user_version')[0]?.values[0]?.[0] ?? 0),
    exec: (sql) => s.exec(sql),
    setUserVersion: (v) => s.exec(`PRAGMA user_version = ${v}`),
    transaction: (fn) => { s.exec('BEGIN'); try { fn(); s.exec('COMMIT'); } catch (e) { s.exec('ROLLBACK'); throw e; } },
  });
  cached = { db: drizzle(s, { schema }) as unknown as DB, close: () => s.close() };
  return cached;
}
