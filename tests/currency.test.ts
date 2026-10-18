import { describe, expect, it } from 'vitest';
import { finishMigration, hasSqlite, rawAtVersion, testDb } from './helpers';
import { applySeed, exportAll, importAll, loadAll, newTx, remove, saveAccount, setRate, upsert } from '../src/db/repo';
import { emptySetup } from '../src/lib/seed';
import { accountBalances, netWorth, summarize } from '../src/lib/ledger';
import { convert, inBase, missingRates, money, textToRate, toBase } from '../src/lib/currency';
import type { Account } from '../src/db/schema';

const acc = (id: string, currency: string, opening = 0): Account => ({ id, name: id, type: 'bank', color: '#000', icon: 'bank', currency, opening,
  creditLimit: null, statementDay: null, dueDay: null, note: '', archived: false, sort: 0, createdAt: 1 });

describe('currency math', () => {
  const rates = new Map([['USD', textToRate('58.25')]]);
  it('converts with micro-precision rates', () => {
    expect(textToRate('58.25')).toBe(58_250_000);
    expect(toBase(100_00, 'USD', rates)).toBe(5_825_00);
    expect(convert(5_825_00, 'PHP', 'USD', rates)).toBe(100_00);
    expect(convert(1_00, 'EUR', 'PHP', rates)).toBeNull();
    expect(toBase(100_00, 'EUR', rates)).toBe(0);
  });
  it('formats foreign money with its own symbol', () => {
    expect(money(123_456, 'USD')).toBe('$1,234.56');
    expect(money(-5_000, 'EUR')).toBe('−€50');
    expect(money(5_000)).toBe('₱50');
  });
  it('reports missing rates only for active foreign accounts', () => {
    expect(missingRates([{ currency: 'USD', archived: false }, { currency: 'EUR', archived: true }, { currency: 'PHP', archived: false }], new Map())).toEqual(['USD']);
  });
  it('converts transactions to pesos for totals, leaving peso-only data untouched', () => {
    const txs = [
      newTx({ type: 'expense', amount: 10_00, accountId: 'usd', date: '2026-10-18' }),
      newTx({ type: 'transfer', amount: 100_00, toAmount: 5_800_00, fee: 1_00, accountId: 'usd', toAccountId: 'php', date: '2026-10-18' }),
      newTx({ type: 'expense', amount: 200_00, accountId: 'php', date: '2026-10-18' }),
    ];
    const cur = new Map([['usd', 'USD'], ['php', 'PHP']]);
    const base = inBase(txs, cur, rates);
    expect(base[0].amount).toBe(582_50);
    expect(base[1]).toMatchObject({ amount: 5_825_00, fee: 58_25, toAmount: 5_800_00 });
    expect(base[2]).toBe(txs[2]);
    expect(summarize(base, '2026-10-01', '2026-10-31').expense).toBe(582_50 + 200_00 + 58_25);
    const phpOnly = [txs[2]];
    expect(inBase(phpOnly, new Map([['php', 'PHP']]), rates)).toBe(phpOnly);
  });
  it('a cross-currency transfer moves each account in its own currency', () => {
    const accounts = [acc('usd', 'USD', 500_00), acc('php', 'PHP', 0)];
    const t = newTx({ type: 'transfer', amount: 100_00, toAmount: 5_800_00, fee: 1_00, accountId: 'usd', toAccountId: 'php', date: '2026-10-18' });
    const bal = accountBalances(accounts, [t]);
    expect(bal.get('usd')).toBe(399_00);
    expect(bal.get('php')).toBe(5_800_00);
    const baseBal = new Map([...bal].map(([id, v]) => [id, toBase(v, id === 'usd' ? 'USD' : 'PHP', rates)]));
    expect(netWorth(accounts, baseBal).net).toBe(Math.round(399_00 * 58.25) + 5_800_00);
  });
});

describe.skipIf(!hasSqlite)('currency in the database', () => {
  it('upgrades a v2 database: transfers keep working, rates and templates tables exist', () => {
    const raw = rawAtVersion(2);
    raw.exec(`
      INSERT INTO accounts (id, name, type, color, opening, created_at) VALUES ('a1','Wise','bank','#000',100000,1), ('a2','GCash','ewallet','#000',0,1);
      INSERT INTO transactions (id,type,amount,account_id,to_account_id,date,created_at,updated_at) VALUES ('t1','transfer',30000,'a1','a2','2026-10-10',1,1);
    `);
    const db = finishMigration(raw);
    const d = loadAll(db);
    expect(d.transactions[0].toAmount).toBeNull();
    expect(accountBalances(d.accounts, d.transactions).get('a2')).toBe(30000);
    expect(d.rates).toEqual([]);
    expect(d.templates).toEqual([]);
  });

  it('stores rates and templates, and they survive a backup round trip', () => {
    const { db } = testDb();
    applySeed(db, emptySetup());
    saveAccount(db, acc('usd', 'USD', 1_000_00), 0);
    saveAccount(db, acc('php', 'PHP', 0), 0);
    setRate(db, 'USD', textToRate('58.25'));
    setRate(db, 'USD', textToRate('58.5')); // update, not duplicate
    upsert.transaction(db, newTx({ type: 'transfer', amount: 100_00, toAmount: 5_850_00, accountId: 'usd', toAccountId: 'php', date: '2026-10-18' }));
    upsert.template(db, { id: 'tp1', name: 'Jeep', type: 'expense', amount: 13_00, accountId: 'php', toAccountId: null, categoryId: 'transport', note: 'jeep', tags: '[]', sort: 0, createdAt: 1 });
    expect(() => setRate(db, 'EUR', 0)).toThrow();
    const backup = JSON.parse(JSON.stringify(exportAll(db)));
    expect(backup.version).toBe(3);
    const fresh = testDb();
    importAll(fresh.db, backup);
    const d = loadAll(fresh.db);
    expect(d.rates).toMatchObject([{ currency: 'USD', perUnit: 58_500_000 }]);
    expect(d.templates[0]).toMatchObject({ name: 'Jeep', amount: 13_00 });
    expect(accountBalances(d.accounts, d.transactions).get('php')).toBe(5_850_00);
    // Deleting an account a template points at clears the link instead of failing.
    remove.template(fresh.db, 'tp1');
    expect(loadAll(fresh.db).templates).toHaveLength(0);
  });

  it('rejects a non-positive received amount at the database level', () => {
    const { db } = testDb();
    applySeed(db, emptySetup());
    saveAccount(db, acc('usd', 'USD'), 0);
    saveAccount(db, acc('php', 'PHP'), 0);
    expect(() => upsert.transaction(db, newTx({ type: 'transfer', amount: 1_00, toAmount: 0, accountId: 'usd', toAccountId: 'php', date: '2026-10-18' }))).toThrow();
  });
});
