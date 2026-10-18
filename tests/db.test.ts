import { describe, expect, it } from 'vitest';
import { finishMigration, hasSqlite, rawAtVersion, testDb } from './helpers';
import {
  loadAll, applySeed, upsert, remove, payRecurring, undoRecurringPayment, payInstallment, createDebt, recordDebtPayment, addBorrowing,
  saveAccount, exportAll, importAll, applyPwaImport, wipeAll, setSetting, accountIsUnused, deleteAccount, newTx, softDelete, restore, purge,
  purgeOld, goalMove, creditInterest, ensureDefaults, updateMany,
} from '../src/db/repo';
import { mySetup } from '../src/lib/seed';
import { accountBalances, debtStatus, goalFund, pendingInterest, summarize } from '../src/lib/ledger';
import { convertPwaBackup } from '../src/lib/importPwa';
import { SCHEMA_VERSION } from '../src/db/migrations';
import type { Debt } from '../src/db/schema';

const today = '2026-10-18';
function seeded() { const t = testDb(); applySeed(t.db, mySetup(today)); return t; }
const debtRow = (p: Partial<Debt> = {}): Debt => ({ id: 'd1', direction: 'owe', partyType: 'person', person: 'Kuya', principal: 1000000, alreadyPaid: 0,
  interestRate: 0, startDate: today, dueDate: null, note: '', closed: false, createdAt: 1, ...p });

describe.skipIf(!hasSqlite)('database', () => {
  it('migrates to the latest version and every table matches the Drizzle schema', () => {
    const { db, raw } = seeded();
    expect(raw.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    const d = loadAll(db);
    expect(d.accounts).toHaveLength(8);
    expect(d.categories.find(c => c.id === 'fees')).toBeTruthy();
    expect(d.settings.setupDone).toBe(true);
  });

  it('upgrades a Phase 1 database without losing data', () => {
    const raw = rawAtVersion(1);
    raw.exec(`
      INSERT INTO categories (id, kind, name, color) VALUES ('food','expense','Food','#000');
      INSERT INTO accounts (id, name, type, color, opening, created_at) VALUES ('a1','Wise','bank','#000',500000,1);
      INSERT INTO transactions (id,type,amount,account_id,category_id,date,note,created_at,updated_at) VALUES ('t1','expense',18000,'a1','food','2026-10-16','lunch',1,1);
      INSERT INTO debts (id,direction,person,principal,created_at) VALUES ('d1','owe','Kuya',1000000,1);
      INSERT INTO transactions (id,type,amount,account_id,date,debt_id,created_at,updated_at) VALUES ('t2','debt_in',1000000,'a1','2026-10-01','d1',1,1);
      INSERT INTO transactions (id,type,amount,account_id,date,debt_id,created_at,updated_at) VALUES ('t3','debt_out',400000,'a1','2026-10-10','d1',1,1);
      INSERT INTO budgets (id,name,category_id,period,amount,start_date,created_at) VALUES ('b1','Food','food','monthly',500000,'2026-10-01',1);
      INSERT INTO recurring (id,name,kind,amount,account_id,frequency,next_due,created_at) VALUES ('r1','Internet','bill',140000,'a1','monthly','2026-11-05',1);
      INSERT INTO goals (id,name,target,deadline,color,created_at) VALUES ('g1','House',280000000,'2029-10-18','#000',1);
      INSERT INTO settings (key,value) VALUES ('setupDone','true');
    `);
    const db = finishMigration(raw);
    ensureDefaults(db);
    const d = loadAll(db);
    expect(d.transactions).toHaveLength(3);
    expect(d.transactions.find(t => t.id === 't1')).toMatchObject({ note: 'lunch', fee: 0, tags: '[]', deletedAt: null });
    expect(d.transactions.find(t => t.id === 't2')!.debtRole).toBe('start');
    expect(d.transactions.find(t => t.id === 't3')!.debtRole).toBe('payment');
    expect(debtStatus(d.debts[0], d.transactions)).toMatchObject({ total: 1000000, paid: 400000, remaining: 600000 });
    expect(d.budgets[0].kind).toBe('expense');
    expect(d.recurring[0].debtId).toBeNull();
    expect(d.goals[0].startingSaved).toBe(0);
    expect(d.categories.find(c => c.id === 'food')!.icon).toBe('silverware-fork-knife');
    expect(d.categories.find(c => c.id === 'fees')).toBeTruthy();
    expect(accountBalances(d.accounts, d.transactions).get('a1')).toBe(500000 - 18000 + 1000000 - 400000);
  });

  it('enforces money rules at the database level', () => {
    const { db } = seeded();
    const acc = loadAll(db).accounts[0];
    expect(() => upsert.transaction(db, newTx({ type: 'expense', amount: -5, accountId: acc.id, date: today }))).toThrow();
    expect(() => upsert.transaction(db, newTx({ type: 'transfer', amount: 5, accountId: acc.id, toAccountId: acc.id, date: today }))).toThrow();
    expect(() => upsert.transaction(db, newTx({ type: 'expense', amount: 5, accountId: 'ghost', date: today }))).toThrow();
    expect(() => upsert.transaction(db, newTx({ type: 'expense', amount: 5, date: today }))).toThrow(); // no account
    expect(() => upsert.transaction(db, newTx({ type: 'goal_in', amount: 5, accountId: acc.id, date: today }))).toThrow(); // no goal
    expect(() => upsert.transaction(db, newTx({ type: 'ext_out', amount: 5, fee: -1, accountId: acc.id, date: today }))).toThrow();
  });

  it('soft deletes, restores and purges', () => {
    const { db } = seeded();
    const acc = loadAll(db).accounts[0];
    const t = newTx({ type: 'expense', amount: 100, accountId: acc.id, date: today });
    upsert.transaction(db, t);
    softDelete(db, [t.id], 1000);
    let d = loadAll(db);
    expect(d.transactions).toHaveLength(0);
    expect(d.deleted).toHaveLength(1);
    restore(db, [t.id]);
    expect(loadAll(db).transactions).toHaveLength(1);
    softDelete(db, [t.id], 1000);
    purgeOld(db, 1000 + 31 * 86_400_000);
    d = loadAll(db);
    expect(d.deleted).toHaveLength(0);
    const t2 = newTx({ type: 'expense', amount: 100, accountId: acc.id, date: today });
    upsert.transaction(db, t2);
    purge(db, [t2.id]); // not deleted yet → untouched
    expect(loadAll(db).transactions).toHaveLength(1);
  });

  it('pays a planned transfer atomically, retires one-time items, and can undo', () => {
    const { db } = seeded();
    const save = loadAll(db).recurring.find(r => r.kind === 'transfer')!;
    const t = payRecurring(db, save, today);
    let d = loadAll(db);
    expect(d.recurring.find(r => r.id === save.id)!.nextDue).toBe('2026-11-15');
    expect(accountBalances(d.accounts, d.transactions).get(save.toAccountId!)).toBe(3500000);
    undoRecurringPayment(db, save, t.id);
    d = loadAll(db);
    expect(d.transactions).toHaveLength(0);
    const once = { ...save, id: 'once', frequency: 'once', kind: 'bill', toAccountId: null, categoryId: 'other' };
    upsert.recurring(db, once);
    payRecurring(db, once, today);
    expect(loadAll(db).recurring.find(r => r.id === 'once')!.active).toBe(false);
  });

  it('a planned payment linked to a debt records a debt payment', () => {
    const { db } = seeded();
    const wise = loadAll(db).accounts.find(a => a.name === 'Wise')!;
    const debt = debtRow();
    createDebt(db, debt, null, today);
    const r = { ...loadAll(db).recurring[0], id: 'pay-kuya', kind: 'bill', amount: 250000, debtId: 'd1', accountId: wise.id, toAccountId: null };
    upsert.recurring(db, r);
    payRecurring(db, r, today, r.amount, debt);
    const d = loadAll(db);
    expect(debtStatus(debt, d.transactions).remaining).toBe(750000);
    expect(summarize(d.transactions, '2026-10-01', '2026-10-31').expense).toBe(0);
  });

  it('installments stop at the last month', () => {
    const { db } = seeded();
    const acc = loadAll(db).accounts[0];
    upsert.installment(db, { id: 'i1', name: 'Phone', monthlyAmount: 250000, months: 2, paidCount: 0, accountId: acc.id, categoryId: 'other', nextDue: today, note: '', createdAt: 1 });
    payInstallment(db, loadAll(db).installments[0], today);
    payInstallment(db, loadAll(db).installments[0], today);
    const i = loadAll(db).installments[0];
    expect(i.paidCount).toBe(2);
    expect(() => payInstallment(db, i, today)).toThrow(/fully paid/);
    remove.installment(db, 'i1');
    expect(loadAll(db).transactions.every(t => t.installmentId === null)).toBe(true);
  });

  it('debts: already paid, extra borrowing off the books, payments and settling', () => {
    const { db } = seeded();
    const wise = loadAll(db).accounts.find(a => a.name === 'Wise')!;
    const debt = debtRow({ alreadyPaid: 200000 });
    createDebt(db, debt, wise.id, today);
    addBorrowing(db, debt, 300000, null, today);
    recordDebtPayment(db, debt, wise.id, 400000, today, false);
    let d = loadAll(db);
    expect(debtStatus(debt, d.transactions)).toMatchObject({ total: 1300000, paid: 600000, remaining: 700000 });
    expect(accountBalances(d.accounts, d.transactions).get(wise.id)).toBe(1000000 - 400000);
    recordDebtPayment(db, debt, wise.id, 700000, today, true);
    d = loadAll(db);
    expect(d.debts[0].closed).toBe(true);
    addBorrowing(db, d.debts[0], 100000, null, today);
    expect(loadAll(db).debts[0].closed).toBe(false); // borrowing again reopens it
    remove.debt(db, 'd1');
    expect(loadAll(db).transactions).toHaveLength(0);
  });

  it('goals hold their own money and earn monthly interest once', () => {
    const { db } = seeded();
    const wise = loadAll(db).accounts.find(a => a.name === 'Wise')!;
    saveAccount(db, { ...wise, opening: 1000000 }, 0);
    const g = { ...loadAll(db).goals[0], id: 'fund', accountIds: '[]', startingSaved: 50000, annualRate: 1200, createdAt: Date.parse('2026-08-10') };
    upsert.goal(db, g);
    goalMove(db, g, 'in', wise.id, 400000, '2026-08-15');
    goalMove(db, g, 'out', wise.id, 50000, '2026-09-05');
    let d = loadAll(db);
    expect(goalFund(g, d.transactions)).toBe(400000);
    expect(accountBalances(d.accounts, d.transactions).get(wise.id)).toBe(1000000 - 350000);
    const pending = pendingInterest({ ...g, annualRate: 0.12, createdDate: '2026-08-10' }, d.transactions, today);
    expect(pending.map(p => p.date)).toEqual(['2026-08-31', '2026-09-30']);
    expect(pending[0].amount).toBe(4500); // 1% of 450,000 centavos
    creditInterest(db, g, pending);
    d = loadAll(db);
    const g2 = d.goals.find(x => x.id === 'fund')!;
    expect(g2.interestCreditedThrough).toBe('2026-09-30');
    expect(pendingInterest({ ...g2, annualRate: 0.12, createdDate: '2026-08-10' }, d.transactions, today)).toHaveLength(0);
  });

  it('bulk edits and tag removal', () => {
    const { db } = seeded();
    const acc = loadAll(db).accounts[0];
    upsert.tag(db, { id: 'tg', name: 'Bohol trip', color: '#FFB020', createdAt: 1 });
    const a = newTx({ type: 'expense', amount: 100, accountId: acc.id, date: today, tags: '["tg"]' });
    const b = newTx({ type: 'expense', amount: 200, accountId: acc.id, date: today });
    upsert.transaction(db, a); upsert.transaction(db, b);
    updateMany(db, [a.id, b.id], { categoryId: 'food' });
    expect(loadAll(db).transactions.every(t => t.categoryId === 'food')).toBe(true);
    remove.tag(db, 'tg');
    expect(loadAll(db).transactions.find(t => t.id === a.id)!.tags).toBe('[]');
  });

  it('records a balance correction only when asked', () => {
    const { db } = seeded();
    const acc = loadAll(db).accounts[0];
    saveAccount(db, { ...acc, name: 'Wise USD' }, 0);
    expect(loadAll(db).transactions).toHaveLength(0);
    saveAccount(db, acc, -2500);
    const d = loadAll(db);
    expect(d.transactions[0]).toMatchObject({ type: 'adjust', amount: -2500 });
    expect(accountIsUnused(d, acc.id)).toBe(false);
  });

  it('backup round trip keeps deleted items and drops device settings', () => {
    const { db } = seeded();
    const acc = loadAll(db).accounts[0];
    const t = newTx({ type: 'income', amount: 100, accountId: acc.id, date: today });
    upsert.transaction(db, t);
    upsert.transaction(db, newTx({ type: 'expense', amount: 50, accountId: acc.id, date: today, deletedAt: 5 }));
    setSetting(db, 'backupFolderUri', 'content://folder');
    setSetting(db, 'lockEnabled', true);
    const backup = JSON.parse(JSON.stringify(exportAll(db)));
    const fresh = testDb();
    expect(importAll(fresh.db, backup)).toBe(2);
    const d = loadAll(fresh.db);
    expect(d.transactions).toHaveLength(1);
    expect(d.deleted).toHaveLength(1);
    expect(d.settings.backupFolderUri).toBeUndefined();
    expect(d.settings.lockEnabled).toBeUndefined();
    expect(() => importAll(fresh.db, { app: 'other' })).toThrow();
  });

  it('imports a web app backup', () => {
    const { db } = testDb();
    applyPwaImport(db, convertPwaBackup({
      app: 'bahay', accounts: [{ id: 'a1', name: 'GCash', type: 'ewallet', opening: 5000 }],
      transactions: [{ id: 't1', type: 'expense', amount: 1000, accountId: 'a1', categoryId: 'food', date: today }],
    }));
    const d = loadAll(db);
    expect(accountBalances(d.accounts, d.transactions).get('a1')).toBe(4000);
    wipeAll(db);
    expect(loadAll(db).accounts).toHaveLength(0);
  });

  it('only unused accounts can be deleted', () => {
    const { db } = seeded();
    const d = loadAll(db);
    const cash = d.accounts.find(a => a.name === 'Cash')!;
    expect(accountIsUnused(d, cash.id)).toBe(true);
    deleteAccount(db, cash.id);
    const wise = d.accounts.find(a => a.name === 'Wise')!;
    expect(accountIsUnused(d, wise.id)).toBe(false);
    expect(() => deleteAccount(db, wise.id)).toThrow();
  });
});
