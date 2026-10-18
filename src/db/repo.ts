// All database writes go through here. Works with any synchronous Drizzle SQLite driver:
// expo-sqlite on the phone, better-sqlite3 in tests, sql.js in the web preview.
import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import type { BaseSQLiteDatabase, SQLiteTable } from 'drizzle-orm/sqlite-core';
import {
  schema, accounts, categories, transactions, budgets, recurring, installments, debts, goals, paymentMethods, tags, trips, notes, rates, templates, settings,
  type Account, type Category, type Transaction, type Budget, type Recurring, type Installment, type Debt, type Goal, type PaymentMethod,
  type Tag, type Trip, type Note, type Rate, type Template,
} from './schema';
import { advanceDue } from '../lib/ledger';
import { addMonths, todayISO, uid } from '../lib/money';
import { DEFAULT_CATEGORIES, type SeedRows } from '../lib/seed';
import type { PwaImport } from '../lib/importPwa';

export type DB = BaseSQLiteDatabase<'sync', any, typeof schema>;

export interface AllData {
  accounts: Account[]; categories: Category[]; transactions: Transaction[]; deleted: Transaction[]; budgets: Budget[]; recurring: Recurring[];
  installments: Installment[]; debts: Debt[]; goals: Goal[]; paymentMethods: PaymentMethod[]; tags: Tag[]; trips: Trip[]; notes: Note[];
  rates: Rate[]; templates: Template[];
  settings: Record<string, unknown>;
}

const byTxOrder = (a: Transaction, b: Transaction) =>
  b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? '') || b.createdAt - a.createdAt;

export function loadAll(db: DB): AllData {
  const s: Record<string, unknown> = {};
  for (const row of db.select().from(settings).all()) {
    try { s[row.key] = JSON.parse(row.value); } catch { s[row.key] = null; }
  }
  const allTx = db.select().from(transactions).all().sort(byTxOrder);
  return {
    accounts: db.select().from(accounts).all().sort((a, b) => a.sort - b.sort || a.createdAt - b.createdAt),
    categories: db.select().from(categories).all().sort((a, b) => a.sort - b.sort),
    transactions: allTx.filter(t => !t.deletedAt),
    deleted: allTx.filter(t => !!t.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
    budgets: db.select().from(budgets).all(),
    recurring: db.select().from(recurring).all(),
    installments: db.select().from(installments).all(),
    debts: db.select().from(debts).all(),
    goals: db.select().from(goals).all(),
    paymentMethods: db.select().from(paymentMethods).all().sort((a, b) => a.sort - b.sort),
    tags: db.select().from(tags).all().sort((a, b) => a.name.localeCompare(b.name)),
    trips: db.select().from(trips).all().sort((a, b) => b.startDate.localeCompare(a.startDate)),
    notes: db.select().from(notes).all().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt),
    rates: db.select().from(rates).all().sort((a, b) => a.currency.localeCompare(b.currency)),
    templates: db.select().from(templates).all().sort((a, b) => a.sort - b.sort || a.createdAt - b.createdAt),
    settings: s,
  };
}

export function setSetting(db: DB, key: string, value: unknown) {
  const v = JSON.stringify(value ?? null);
  db.insert(settings).values({ key, value: v }).onConflictDoUpdate({ target: settings.key, set: { value: v } }).run();
}

/** Adds categories introduced in newer versions and gives old ones their icons. Safe to run every launch. */
export function ensureDefaults(db: DB) {
  const existing = new Map(db.select().from(categories).all().map(c => [c.id, c]));
  if (existing.size === 0) return; // nothing set up yet
  db.transaction(tx => {
    for (const d of DEFAULT_CATEGORIES) {
      const cur = existing.get(d.id);
      if (!cur) {
        if (d.parentId && !existing.has(d.parentId)) continue;
        tx.insert(categories).values(d).run();
      } else if (cur.icon === 'shape') {
        tx.update(categories).set({ icon: d.icon }).where(eq(categories.id, d.id)).run();
      }
    }
  });
}

// ---------- generic upsert / delete ----------
type TableWithId = typeof accounts | typeof categories | typeof transactions | typeof budgets | typeof recurring | typeof installments
  | typeof debts | typeof goals | typeof paymentMethods | typeof tags | typeof trips | typeof notes | typeof templates;

function upsertIn(db: DB, table: TableWithId, row: object) {
  (db.insert(table) as any).values(row).onConflictDoUpdate({ target: (table as any).id, set: row }).run();
}
const asDb = (tx: unknown) => tx as DB;

export const upsert = {
  account: (db: DB, r: Account) => upsertIn(db, accounts, r),
  category: (db: DB, r: Category) => upsertIn(db, categories, r),
  transaction: (db: DB, r: Transaction) => upsertIn(db, transactions, r),
  budget: (db: DB, r: Budget) => upsertIn(db, budgets, r),
  recurring: (db: DB, r: Recurring) => upsertIn(db, recurring, r),
  installment: (db: DB, r: Installment) => upsertIn(db, installments, r),
  debt: (db: DB, r: Debt) => upsertIn(db, debts, r),
  goal: (db: DB, r: Goal) => upsertIn(db, goals, r),
  paymentMethod: (db: DB, r: PaymentMethod) => upsertIn(db, paymentMethods, r),
  tag: (db: DB, r: Tag) => upsertIn(db, tags, r),
  trip: (db: DB, r: Trip) => upsertIn(db, trips, r),
  note: (db: DB, r: Note) => upsertIn(db, notes, r),
  template: (db: DB, r: Template) => upsertIn(db, templates, r),
};

// ---------- exchange rates ----------
/** perUnit = pesos for one unit of the currency, times 1,000,000. */
export function setRate(db: DB, currency: string, perUnit: number, now = Date.now()) {
  if (!(perUnit > 0)) throw new Error('Enter a rate above zero.');
  const row = { currency, perUnit: Math.round(perUnit), updatedAt: now };
  db.insert(rates).values(row).onConflictDoUpdate({ target: rates.currency, set: row }).run();
}
export function removeRate(db: DB, currency: string) { db.delete(rates).where(eq(rates.currency, currency)).run(); }

export const remove = {
  budget: (db: DB, id: string) => db.delete(budgets).where(eq(budgets.id, id)).run(),
  recurring: (db: DB, id: string) => db.delete(recurring).where(eq(recurring.id, id)).run(),
  paymentMethod: (db: DB, id: string) => db.delete(paymentMethods).where(eq(paymentMethods.id, id)).run(),
  note: (db: DB, id: string) => db.delete(notes).where(eq(notes.id, id)).run(),
  template: (db: DB, id: string) => db.delete(templates).where(eq(templates.id, id)).run(),
  trip: (db: DB, id: string) => db.transaction(tx => {
    tx.update(transactions).set({ tripId: null }).where(eq(transactions.tripId, id)).run();
    tx.delete(trips).where(eq(trips.id, id)).run();
  }),
  /** Removes the tag from every transaction too. */
  tag: (db: DB, id: string) => db.transaction(tx => {
    for (const t of tx.select({ id: transactions.id, tags: transactions.tags }).from(transactions).all()) {
      const list = JSON.parse(t.tags) as string[];
      if (list.includes(id)) tx.update(transactions).set({ tags: JSON.stringify(list.filter(x => x !== id)) }).where(eq(transactions.id, t.id)).run();
    }
    tx.delete(tags).where(eq(tags.id, id)).run();
  }),
  /** Past payments stay in history; they just lose the link. */
  installment: (db: DB, id: string) => db.transaction(tx => {
    tx.update(transactions).set({ installmentId: null }).where(eq(transactions.installmentId, id)).run();
    tx.delete(installments).where(eq(installments.id, id)).run();
  }),
  /** A debt and every movement recorded against it. */
  debt: (db: DB, id: string) => db.transaction(tx => {
    tx.delete(transactions).where(eq(transactions.debtId, id)).run();
    tx.update(recurring).set({ debtId: null }).where(eq(recurring.debtId, id)).run();
    tx.delete(debts).where(eq(debts.id, id)).run();
  }),
  /** Only call when the goal's own fund is empty; contributions and withdrawals go with it. */
  goal: (db: DB, id: string) => db.transaction(tx => {
    tx.delete(transactions).where(eq(transactions.goalId, id)).run();
    tx.delete(goals).where(eq(goals.id, id)).run();
  }),
  category: (db: DB, id: string) => db.delete(categories).where(eq(categories.id, id)).run(),
};

// ---------- transactions: soft delete ----------
export function softDelete(db: DB, ids: string[], now = Date.now()) {
  if (ids.length) db.update(transactions).set({ deletedAt: now }).where(inArray(transactions.id, ids)).run();
}
export function restore(db: DB, ids: string[]) {
  if (ids.length) db.update(transactions).set({ deletedAt: null }).where(inArray(transactions.id, ids)).run();
}
export function purge(db: DB, ids: string[]) {
  if (ids.length) db.delete(transactions).where(and(inArray(transactions.id, ids), isNotNull(transactions.deletedAt))).run();
}
/** Recently Deleted keeps items for 30 days. */
export function purgeOld(db: DB, now = Date.now(), days = 30) {
  db.delete(transactions).where(and(isNotNull(transactions.deletedAt), lt(transactions.deletedAt, now - days * 86_400_000))).run();
}
export function updateMany(db: DB, ids: string[], patch: Partial<Pick<Transaction, 'categoryId' | 'tags' | 'tripId'>>) {
  if (ids.length) db.update(transactions).set({ ...patch, updatedAt: Date.now() }).where(inArray(transactions.id, ids)).run();
}

// ---------- accounts ----------
export function accountIsUnused(data: AllData, id: string) {
  return ![...data.transactions, ...data.deleted].some(t => t.accountId === id || t.toAccountId === id)
    && !data.recurring.some(r => r.accountId === id || r.toAccountId === id)
    && !data.installments.some(i => i.accountId === id)
    && !data.goals.some(g => (JSON.parse(g.accountIds) as string[]).includes(id));
}
export function deleteAccount(db: DB, id: string) { db.delete(accounts).where(eq(accounts.id, id)).run(); }

/** Saves an account; a non-zero correction records the difference as an adjustment today. */
export function saveAccount(db: DB, account: Account, correction: number) {
  db.transaction(tx => {
    upsertIn(asDb(tx), accounts, account);
    if (correction !== 0) upsertIn(asDb(tx), transactions, newTx({ type: 'adjust', amount: correction, accountId: account.id, date: todayISO() }));
  });
}

// ---------- helpers ----------
export function newTx(p: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'date'>): Transaction {
  const now = Date.now();
  return {
    id: uid(), fee: 0, toAmount: null, accountId: null, toAccountId: null, categoryId: null, time: null, note: '', counterparty: null, heldFor: null, photoUri: null,
    tags: '[]', recurringId: null, installmentId: null, debtId: null, debtRole: null, goalId: null, tripId: null, deletedAt: null,
    createdAt: now, updatedAt: now, ...p,
  };
}

// ---------- planned payments ----------
export function payRecurring(db: DB, r: Recurring, date: string, amount = r.amount, debt?: Debt | null): Transaction {
  let t: Transaction;
  if (r.debtId && debt) {
    t = newTx({ type: debt.direction === 'owe' ? 'debt_out' : 'debt_in', amount, accountId: r.accountId, date, note: r.name,
      recurringId: r.id, debtId: debt.id, debtRole: 'payment' });
  } else {
    const type = r.kind === 'income' ? 'income' : r.kind === 'transfer' ? 'transfer' : 'expense';
    t = newTx({ type, amount, accountId: r.accountId, toAccountId: type === 'transfer' ? r.toAccountId : null,
      categoryId: type === 'transfer' ? null : r.categoryId, date, note: r.name, recurringId: r.id });
  }
  const next = advanceDue(r.frequency, r.nextDue);
  const stillActive = r.frequency !== 'once' && !(r.endDate && next > r.endDate);
  db.transaction(tx => {
    upsertIn(asDb(tx), transactions, t);
    tx.update(recurring).set({ nextDue: next, active: stillActive }).where(eq(recurring.id, r.id)).run();
  });
  return t;
}

export function skipRecurring(db: DB, r: Recurring) {
  const next = advanceDue(r.frequency, r.nextDue);
  db.update(recurring).set({ nextDue: next, active: r.frequency !== 'once' && !(r.endDate && next > r.endDate) }).where(eq(recurring.id, r.id)).run();
}

export function undoRecurringPayment(db: DB, r: Recurring, txId: string) {
  db.transaction(tx => {
    tx.delete(transactions).where(eq(transactions.id, txId)).run();
    tx.update(recurring).set({ nextDue: r.nextDue, active: r.active }).where(eq(recurring.id, r.id)).run();
  });
}

export function payInstallment(db: DB, i: Installment, date: string): Transaction {
  if (i.paidCount >= i.months) throw new Error('This installment is already fully paid.');
  const t = newTx({ type: 'expense', amount: i.monthlyAmount, accountId: i.accountId, categoryId: i.categoryId, date,
    note: `${i.name} ${i.paidCount + 1}/${i.months}`, installmentId: i.id });
  db.transaction(tx => {
    upsertIn(asDb(tx), transactions, t);
    tx.update(installments).set({ paidCount: i.paidCount + 1, nextDue: addMonths(i.nextDue, 1) }).where(eq(installments.id, i.id)).run();
  });
  return t;
}

export function undoInstallmentPayment(db: DB, i: Installment, txId: string) {
  db.transaction(tx => {
    tx.delete(transactions).where(eq(transactions.id, txId)).run();
    tx.update(installments).set({ paidCount: i.paidCount, nextDue: i.nextDue }).where(eq(installments.id, i.id)).run();
  });
}

// ---------- debts and money owed to you ----------
/** Borrowing ("owe") puts money into the account; lending ("owed") takes it out. No account = off the books. */
export function createDebt(db: DB, d: Debt, startAccountId: string | null, date: string) {
  db.transaction(tx => {
    upsertIn(asDb(tx), debts, d);
    if (startAccountId) {
      upsertIn(asDb(tx), transactions, newTx({
        type: d.direction === 'owe' ? 'debt_in' : 'debt_out', amount: d.principal, accountId: startAccountId, date,
        note: d.direction === 'owe' ? `Borrowed from ${d.person}` : `Lent to ${d.person}`, debtId: d.id, debtRole: 'start',
      }));
    }
  });
}

export function addBorrowing(db: DB, d: Debt, amount: number, accountId: string | null, date: string, note = ''): Transaction {
  const t = newTx({ type: d.direction === 'owe' ? 'debt_in' : 'debt_out', amount, accountId, date, debtId: d.id, debtRole: 'borrow',
    note: note || (d.direction === 'owe' ? `Borrowed more from ${d.person}` : `Lent more to ${d.person}`) });
  db.transaction(tx => {
    upsertIn(asDb(tx), transactions, t);
    if (d.closed) tx.update(debts).set({ closed: false }).where(eq(debts.id, d.id)).run();
  });
  return t;
}

export function recordDebtPayment(db: DB, d: Debt, accountId: string | null, amount: number, date: string, settles: boolean): Transaction {
  const t = newTx({ type: d.direction === 'owe' ? 'debt_out' : 'debt_in', amount, accountId, date, debtId: d.id, debtRole: 'payment',
    note: d.direction === 'owe' ? `Paid ${d.person}` : `${d.person} paid back` });
  db.transaction(tx => {
    upsertIn(asDb(tx), transactions, t);
    if (settles) tx.update(debts).set({ closed: true }).where(eq(debts.id, d.id)).run();
  });
  return t;
}

// ---------- goals ----------
export function goalMove(db: DB, g: Goal, kind: 'in' | 'out', accountId: string, amount: number, date: string, note = ''): Transaction {
  const t = newTx({ type: kind === 'in' ? 'goal_in' : 'goal_out', amount, accountId, goalId: g.id, date,
    note: note || (kind === 'in' ? `Added to ${g.name}` : `Withdrew from ${g.name}`) });
  upsertIn(db, transactions, t);
  return t;
}

export function creditInterest(db: DB, g: Goal, entries: { date: string; amount: number }[]) {
  if (!entries.length) return;
  db.transaction(tx => {
    for (const e of entries) {
      upsertIn(asDb(tx), transactions, newTx({ type: 'goal_interest', amount: e.amount, goalId: g.id, date: e.date, note: `Interest on ${g.name}` }));
    }
    tx.update(goals).set({ interestCreditedThrough: entries[entries.length - 1].date }).where(eq(goals.id, g.id)).run();
  });
}

// ---------- seed, backup, restore ----------
type ListKey = Exclude<keyof AllData, 'settings' | 'deleted'>;
const ORDER: { name: ListKey; table: SQLiteTable }[] = [
  { name: 'categories', table: categories },
  { name: 'accounts', table: accounts },
  { name: 'transactions', table: transactions },
  { name: 'budgets', table: budgets },
  { name: 'recurring', table: recurring },
  { name: 'installments', table: installments },
  { name: 'debts', table: debts },
  { name: 'goals', table: goals },
  { name: 'paymentMethods', table: paymentMethods },
  { name: 'tags', table: tags },
  { name: 'trips', table: trips },
  { name: 'notes', table: notes },
  { name: 'rates', table: rates },
  { name: 'templates', table: templates },
];

function orderCategories(cats: Category[]): Category[] {
  const ids = new Set(cats.map(c => c.id));
  const roots = cats.filter(c => !c.parentId || !ids.has(c.parentId)).map(c => ({ ...c, parentId: c.parentId && ids.has(c.parentId) ? c.parentId : null }));
  return [...roots, ...cats.filter(c => c.parentId && ids.has(c.parentId))];
}

type Lists = { [K in ListKey]: AllData[K] };
const emptyLists = (): Lists => ({ categories: [], accounts: [], transactions: [], budgets: [], recurring: [], installments: [], debts: [], goals: [],
  paymentMethods: [], tags: [], trips: [], notes: [], rates: [], templates: [] });

function replaceAllIn(db: DB, data: Partial<Lists>, settingsObj: Record<string, unknown>) {
  db.transaction(tx => {
    for (const { table } of [...ORDER].reverse()) tx.delete(table).run();
    tx.delete(settings).run();
    for (const { name, table } of ORDER) {
      let rows = (data[name] ?? []) as unknown[];
      if (name === 'categories') rows = orderCategories(rows as Category[]);
      for (const row of rows) tx.insert(table).values(row as never).run();
    }
    for (const [key, value] of Object.entries(settingsObj)) tx.insert(settings).values({ key, value: JSON.stringify(value ?? null) }).run();
  });
}

export function applySeed(db: DB, rows: SeedRows) {
  replaceAllIn(db, { ...emptyLists(), categories: rows.categories, accounts: rows.accounts, budgets: rows.budgets, recurring: rows.recurring, goals: rows.goals }, rows.settings);
}

export function applyPwaImport(db: DB, p: PwaImport) {
  replaceAllIn(db, { ...emptyLists(), categories: p.categories, accounts: p.accounts, transactions: p.transactions, budgets: p.budgets,
    recurring: p.recurring, goals: p.goals }, p.settings);
}

// Kept from when the app was called Bahay so every existing backup still restores.
export const BACKUP_APP = 'bahay-native';
export const BACKUP_VERSION = 3;

export function exportAll(db: DB) {
  const d = loadAll(db);
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), ...d, transactions: [...d.transactions, ...d.deleted], deleted: undefined };
}

export function importAll(db: DB, raw: unknown): number {
  const d = raw as Record<string, unknown> | null;
  if (!d || d.app !== BACKUP_APP) throw new Error('This file is not a Cynct backup.');
  if (typeof d.version !== 'number' || d.version > BACKUP_VERSION) throw new Error('This backup is from a newer version of Cynct. Update the app first.');
  for (const { name } of ORDER) if (d[name] !== undefined && !Array.isArray(d[name])) throw new Error(`Backup is damaged: "${name}" is not a list.`);
  const s = (d.settings && typeof d.settings === 'object' ? d.settings : {}) as Record<string, unknown>;
  // Device-specific settings don't travel with a backup.
  const { backupFolderUri: _f, lastAutoBackup: _l, lockEnabled: _k, ...portable } = s;
  const lists: Partial<Lists> = {};
  for (const { name } of ORDER) (lists as Record<string, unknown>)[name] = d[name] ?? [];
  replaceAllIn(db, lists, { ...portable, setupDone: true });
  ensureDefaults(db);
  return ((d.transactions as unknown[] | undefined) ?? []).length;
}

export function wipeAll(db: DB) { replaceAllIn(db, emptyLists(), {}); }
