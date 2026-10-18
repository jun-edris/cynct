import { createRequire } from 'node:module';
import type BetterSqlite3 from 'better-sqlite3';
import { migrate, MIGRATIONS } from '../src/db/migrations';
import { schema } from '../src/db/schema';
import type { DB } from '../src/db/repo';

// better-sqlite3 is an optional dependency: it needs a native build, which fails on Windows
// without the C++ build tools. When it's missing, the database tests are skipped.
const require = createRequire(import.meta.url);
let Database: typeof BetterSqlite3 | null = null;
let drizzle: ((client: BetterSqlite3.Database, cfg: object) => unknown) | null = null;
try {
  Database = require('better-sqlite3');
  drizzle = require('drizzle-orm/better-sqlite3').drizzle;
} catch { Database = null; }
export const hasSqlite = Database !== null;

function adapter(raw: BetterSqlite3.Database) {
  return {
    getUserVersion: () => (raw.pragma('user_version', { simple: true }) as number),
    exec: (sql: string) => raw.exec(sql),
    setUserVersion: (v: number) => raw.pragma(`user_version = ${v}`),
    transaction: (fn: () => void) => raw.transaction(fn)(),
  };
}

export function testDb(): { db: DB; raw: BetterSqlite3.Database } {
  if (!Database || !drizzle) throw new Error('better-sqlite3 is not installed');
  const raw = new Database(':memory:');
  migrate(adapter(raw));
  return { db: drizzle(raw, { schema }) as unknown as DB, raw };
}

/** A database stuck at an older schema version, for migration tests. */
export function rawAtVersion(version: number): BetterSqlite3.Database {
  if (!Database) throw new Error('better-sqlite3 is not installed');
  const raw = new Database(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  for (let v = 0; v < version; v++) { raw.exec(MIGRATIONS[v]); raw.pragma(`user_version = ${v + 1}`); }
  return raw;
}

export function finishMigration(raw: BetterSqlite3.Database): DB {
  migrate(adapter(raw));
  return drizzle!(raw, { schema }) as unknown as DB;
}
