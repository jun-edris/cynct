// Hand-written migrations keyed by PRAGMA user_version.
// Rule: never edit a shipped migration. Add a new entry to MIGRATIONS instead.

export const MIGRATIONS: string[] = [
  // v1 — Phase 1 schema
  `
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('cash','bank','ewallet','savings','credit','loan','investment')),
    color TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'PHP',
    opening INTEGER NOT NULL DEFAULT 0,
    credit_limit INTEGER,
    note TEXT NOT NULL DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('expense','income')),
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    color TEXT NOT NULL,
    keywords TEXT NOT NULL DEFAULT '[]',
    archived INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('expense','income','transfer','adjust','debt_out','debt_in')),
    amount INTEGER NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    to_account_id TEXT REFERENCES accounts(id),
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    date TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    recurring_id TEXT,
    installment_id TEXT,
    debt_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    CHECK (type = 'adjust' OR amount > 0),
    CHECK (type <> 'transfer' OR (to_account_id IS NOT NULL AND to_account_id <> account_id))
  );
  CREATE INDEX IF NOT EXISTS tx_date ON transactions(date);
  CREATE INDEX IF NOT EXISTS tx_account ON transactions(account_id);
  CREATE INDEX IF NOT EXISTS tx_category ON transactions(category_id);
  CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
    period TEXT NOT NULL CHECK (period IN ('weekly','monthly','yearly')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    rollover INTEGER NOT NULL DEFAULT 0,
    start_date TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS recurring (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('bill','income','transfer')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    to_account_id TEXT REFERENCES accounts(id),
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('weekly','monthly','semimonthly','quarterly','yearly')),
    next_due TEXT NOT NULL,
    end_date TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS installments (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    monthly_amount INTEGER NOT NULL CHECK (monthly_amount > 0),
    months INTEGER NOT NULL CHECK (months > 0),
    paid_count INTEGER NOT NULL DEFAULT 0,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    next_due TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS debts (
    id TEXT PRIMARY KEY NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('owe','owed')),
    person TEXT NOT NULL,
    principal INTEGER NOT NULL CHECK (principal > 0),
    due_date TEXT,
    note TEXT NOT NULL DEFAULT '',
    closed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    target INTEGER NOT NULL CHECK (target > 0),
    deadline TEXT NOT NULL,
    monthly INTEGER NOT NULL DEFAULT 0,
    annual_rate_bp INTEGER NOT NULL DEFAULT 0,
    account_ids TEXT NOT NULL DEFAULT '[]',
    color TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payment_methods (
    id TEXT PRIMARY KEY NOT NULL,
    label TEXT NOT NULL,
    kind TEXT NOT NULL,
    account_name TEXT NOT NULL DEFAULT '',
    account_number TEXT NOT NULL DEFAULT '',
    qr_uri TEXT,
    note TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,

  // v2 — Build 1 redesign. Tables whose CHECK rules change are rebuilt; data is copied across.
  `
  ALTER TABLE accounts ADD COLUMN icon TEXT NOT NULL DEFAULT 'wallet';
  ALTER TABLE accounts ADD COLUMN statement_day INTEGER;
  ALTER TABLE accounts ADD COLUMN due_day INTEGER;
  ALTER TABLE categories ADD COLUMN icon TEXT NOT NULL DEFAULT 'shape';

  CREATE TABLE transactions_v2 (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('expense','income','transfer','adjust','debt_out','debt_in','ext_out','ext_in','goal_in','goal_out','goal_interest')),
    amount INTEGER NOT NULL,
    fee INTEGER NOT NULL DEFAULT 0 CHECK (fee >= 0),
    account_id TEXT REFERENCES accounts(id),
    to_account_id TEXT REFERENCES accounts(id),
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    date TEXT NOT NULL,
    time TEXT,
    note TEXT NOT NULL DEFAULT '',
    counterparty TEXT,
    held_for TEXT,
    photo_uri TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    recurring_id TEXT,
    installment_id TEXT,
    debt_id TEXT,
    debt_role TEXT CHECK (debt_role IS NULL OR debt_role IN ('start','borrow','payment')),
    goal_id TEXT,
    trip_id TEXT,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    CHECK (type = 'adjust' OR amount > 0),
    CHECK (type <> 'transfer' OR (account_id IS NOT NULL AND to_account_id IS NOT NULL AND to_account_id <> account_id)),
    CHECK (account_id IS NOT NULL OR type IN ('goal_interest','debt_in','debt_out')),
    CHECK (type NOT IN ('goal_in','goal_out','goal_interest') OR goal_id IS NOT NULL)
  );
  INSERT INTO transactions_v2 (id, type, amount, account_id, to_account_id, category_id, date, note, recurring_id, installment_id, debt_id, created_at, updated_at)
    SELECT id, type, amount, account_id, to_account_id, category_id, date, note, recurring_id, installment_id, debt_id, created_at, updated_at FROM transactions;
  DROP TABLE transactions;
  ALTER TABLE transactions_v2 RENAME TO transactions;
  CREATE INDEX tx_date ON transactions(date);
  CREATE INDEX tx_account ON transactions(account_id);
  CREATE INDEX tx_category ON transactions(category_id);
  CREATE INDEX tx_goal ON transactions(goal_id);
  CREATE INDEX tx_debt ON transactions(debt_id);

  ALTER TABLE debts ADD COLUMN party_type TEXT NOT NULL DEFAULT 'person';
  ALTER TABLE debts ADD COLUMN already_paid INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE debts ADD COLUMN interest_rate_bp INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE debts ADD COLUMN start_date TEXT;
  -- Old debt rows: money moving the same way as the debt began is its start; the other way is a payment.
  UPDATE transactions SET debt_role = CASE
      WHEN (SELECT direction FROM debts d WHERE d.id = transactions.debt_id) = 'owe' AND type = 'debt_in' THEN 'start'
      WHEN (SELECT direction FROM debts d WHERE d.id = transactions.debt_id) = 'owed' AND type = 'debt_out' THEN 'start'
      ELSE 'payment' END
    WHERE debt_id IS NOT NULL;

  CREATE TABLE budgets_v2 (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense','income')),
    category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
    period TEXT NOT NULL CHECK (period IN ('daily','weekly','biweekly','monthly','yearly')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    rollover INTEGER NOT NULL DEFAULT 0,
    start_date TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  INSERT INTO budgets_v2 (id, name, category_id, period, amount, rollover, start_date, created_at)
    SELECT id, name, category_id, period, amount, rollover, start_date, created_at FROM budgets;
  DROP TABLE budgets;
  ALTER TABLE budgets_v2 RENAME TO budgets;

  CREATE TABLE recurring_v2 (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('bill','income','transfer')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    to_account_id TEXT REFERENCES accounts(id),
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('once','weekly','monthly','semimonthly','quarterly','yearly')),
    next_due TEXT NOT NULL,
    end_date TEXT,
    debt_id TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );
  INSERT INTO recurring_v2 (id, name, kind, amount, account_id, to_account_id, category_id, frequency, next_due, end_date, active, created_at)
    SELECT id, name, kind, amount, account_id, to_account_id, category_id, frequency, next_due, end_date, active, created_at FROM recurring;
  DROP TABLE recurring;
  ALTER TABLE recurring_v2 RENAME TO recurring;

  ALTER TABLE goals ADD COLUMN starting_saved INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE goals ADD COLUMN interest_through TEXT;
  ALTER TABLE goals ADD COLUMN photo_uri TEXT;
  ALTER TABLE goals ADD COLUMN note TEXT NOT NULL DEFAULT '';

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'airplane',
    start_date TEXT NOT NULL,
    end_date TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    pinned INTEGER NOT NULL DEFAULT 0,
    remind_on TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,
  // v3 — Build 2: cross-currency transfers, exchange rates, entry templates
  `
  ALTER TABLE transactions ADD COLUMN to_amount INTEGER CHECK (to_amount IS NULL OR to_amount > 0);
  CREATE TABLE rates (
    currency TEXT PRIMARY KEY NOT NULL,
    per_unit INTEGER NOT NULL CHECK (per_unit > 0),
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE templates (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('expense','income','transfer')),
    amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
    account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    to_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    note TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    sort INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  `,
  // v4 — Phase 3: invoices
  `
  CREATE TABLE invoices (
    id TEXT PRIMARY KEY NOT NULL,
    number TEXT NOT NULL,
    client TEXT NOT NULL DEFAULT '',
    client_email TEXT NOT NULL DEFAULT '',
    client_address TEXT NOT NULL DEFAULT '',
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'PHP',
    items TEXT NOT NULL DEFAULT '[]',
    tax_rate_bp INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate_bp >= 0),
    discount INTEGER NOT NULL DEFAULT 0 CHECK (discount >= 0),
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid')),
    paid_on TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

// Minimal interface shared by expo-sqlite (app) and better-sqlite3 (tests).
export interface MigratableDb {
  getUserVersion(): number;
  exec(sql: string): void;
  setUserVersion(v: number): void;
  transaction(fn: () => void): void;
}

export function migrate(db: MigratableDb): number {
  db.exec('PRAGMA foreign_keys = ON;');
  let version = db.getUserVersion();
  if (version > SCHEMA_VERSION) {
    throw new Error(`Database is from a newer version of Cynct (v${version}). Update the app.`);
  }
  while (version < SCHEMA_VERSION) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    db.transaction(() => {
      db.exec(sql);
      db.setUserVersion(next);
    });
    version = next;
  }
  return version;
}
