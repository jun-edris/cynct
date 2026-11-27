import { describe, expect, it } from 'vitest';
import { finishMigration, hasSqlite, rawAtVersion } from './helpers';
import { applySeed, freezeBaseAmounts, loadAll, newTx, payInstallment, payRecurring, saveAccount, upsert } from '../src/db/repo';
import { emptySetup } from '../src/lib/seed';
import { advanceDue, anchorFor, onDay, summarize, upcoming } from '../src/lib/ledger';
import { RATE_SCALE, inBase, snapshotBase } from '../src/lib/currency';
import type { Account } from '../src/db/schema';

const acc = (id: string, currency: string, opening = 0): Account => ({ id, name: id, type: 'bank', color: '#000', icon: 'bank', currency, opening,
  creditLimit: null, dueDay: null, statementDay: null, note: '', archived: false, sort: 0, createdAt: 1 } as unknown as Account);

describe('due dates keep their day of the month', () => {
  it('a bill on the 31st comes back to the 31st after a short month', () => {
    let d = '2027-01-31';
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) { d = advanceDue('monthly', d, 31); seen.push(d); }
    expect(seen).toEqual(['2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31']);
    // Without an anchor it used to stick to the 28th from February on.
    expect(advanceDue('monthly', '2027-02-28', null)).toBe('2027-03-28');
  });
  it('quarterly and yearly keep the anchor, leap days included', () => {
    expect(advanceDue('quarterly', '2027-11-30', 31)).toBe('2028-02-29');
    expect(advanceDue('quarterly', '2028-02-29', 31)).toBe('2028-05-31');
    expect(advanceDue('yearly', '2028-02-28', 29)).toBe('2029-02-28');
    expect(anchorFor('monthly', '2026-12-31')).toBe(31);
    expect(anchorFor('weekly', '2026-12-31')).toBeNull();
    expect(onDay('2026-02-10', 30)).toBe('2026-02-28');
  });
  it('the timeline and installments use the anchor too', () => {
    const list = upcoming([{ id: 'r', name: 'Rent', kind: 'bill', amount: 1, frequency: 'monthly', nextDue: '2027-01-31', endDate: null, active: true, anchorDay: 31 }],
      [{ id: 'i', name: 'Phone', monthlyAmount: 1, months: 4, paidCount: 0, nextDue: '2027-01-30', anchorDay: 30 }], '2027-01-01', 100);
    expect(list.filter(x => x.id === 'r').map(x => x.date)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
    expect(list.filter(x => x.id === 'i').map(x => x.date)).toEqual(['2027-01-30', '2027-02-28', '2027-03-30']);
  });
});

describe('foreign entries keep the peso value they had', () => {
  const cur = new Map([['usd', 'USD'], ['php', 'PHP']]);
  const at = (r: number) => new Map([['USD', Math.round(r * RATE_SCALE)]]);
  const base = { id: 'x', accountId: 'usd', toAccountId: null, fee: 0, toAmount: null, origAmount: null, origCurrency: null, baseAmount: null as number | null, date: '2026-11-23', categoryId: null };

  it('snapshots at the rate it is first seen, or the exact peso side when there is one', () => {
    expect(snapshotBase({ type: 'income', amount: 5_500 }, 'USD', null, at(63.8))).toBe(350_900);
    expect(snapshotBase({ type: 'expense', amount: 1_200, origAmount: 70_250, origCurrency: 'PHP' }, 'USD', null, at(60))).toBe(70_250);
    expect(snapshotBase({ type: 'transfer', amount: 10_000, toAmount: 630_000 }, 'USD', 'PHP', at(60))).toBe(630_000);
    expect(snapshotBase({ type: 'income', amount: 5_500 }, 'PHP', null, at(60))).toBeNull();
    expect(snapshotBase({ type: 'income', amount: 5_500 }, 'USD', null, new Map())).toBeNull();
  });

  it('last month’s $55 stays ₱3,509 when the rate moves', () => {
    const t = { ...base, type: 'income', amount: 5_500, baseAmount: 350_900 };
    expect(inBase([t], cur, at(70))[0].amount).toBe(350_900);
    expect(summarize(inBase([t], cur, at(50)), '2026-11-01', '2026-11-30').income).toBe(350_900);
    // Not frozen yet: today's rate.
    expect(inBase([{ ...t, baseAmount: null }], cur, at(70))[0].amount).toBe(385_000);
  });

  it('a fee follows the frozen rate', () => {
    const t = { ...base, type: 'ext_out', amount: 10_000, fee: 200, baseAmount: 640_000 };
    expect(inBase([t], cur, at(50))[0]).toMatchObject({ amount: 640_000, fee: 12_800 });
  });
});

describe.skipIf(!hasSqlite)('database v6', () => {
  it('upgrades v5: anchors monthly plans and installments to their due day, and stores peso values', () => {
    const raw = rawAtVersion(5);
    const db = finishMigration(raw);
    applySeed(db, emptySetup());
    saveAccount(db, acc('usd', 'USD'), 0);
    saveAccount(db, acc('php', 'PHP', 100_000_00), 0);
    upsert.recurring(db, { id: 'rent', name: 'Rent', kind: 'bill', amount: 8_000_00, accountId: 'php', toAccountId: null, categoryId: null, frequency: 'monthly',
      nextDue: '2027-01-31', anchorDay: 31, endDate: null, debtId: null, active: true, createdAt: 1 });
    payRecurring(db, loadAll(db).recurring[0], '2027-01-31');
    payRecurring(db, loadAll(db).recurring[0], '2027-02-28');
    expect(loadAll(db).recurring[0].nextDue).toBe('2027-03-31');
    upsert.installment(db, { id: 'i', name: 'Phone', monthlyAmount: 1_000_00, months: 3, paidCount: 0, accountId: 'php', categoryId: null, nextDue: '2027-01-30', anchorDay: 30, note: '', createdAt: 1 });
    payInstallment(db, loadAll(db).installments[0], '2027-01-30');
    payInstallment(db, loadAll(db).installments[0], '2027-02-28');
    expect(loadAll(db).installments[0].nextDue).toBe('2027-03-30');
    const t = newTx({ type: 'income', amount: 5_500, accountId: 'usd', date: '2026-11-23' });
    upsert.transaction(db, t);
    freezeBaseAmounts(db, [[t.id, 350_900]]);
    expect(loadAll(db).transactions.find(x => x.id === t.id)?.baseAmount).toBe(350_900);
  });

  it('backfills anchors for plans that existed before the upgrade', () => {
    const raw = rawAtVersion(5);
    raw.exec(`INSERT INTO accounts (id,name,type,color,currency,opening,created_at) VALUES ('a','A','bank','#000','PHP',0,1)`);
    raw.exec(`INSERT INTO recurring (id,name,kind,amount,account_id,frequency,next_due,active,created_at) VALUES ('r','Rent','bill',100,'a','monthly','2027-03-31',1,1),('w','Gym','bill',100,'a','weekly','2027-03-31',1,1)`);
    const db = finishMigration(raw);
    const rec = loadAll(db).recurring;
    expect(rec.find(x => x.id === 'r')?.anchorDay).toBe(31);
    expect(rec.find(x => x.id === 'w')?.anchorDay).toBeNull();
  });
});

import { dailySpendingDetail } from '../src/lib/paycheck';
import { monthsUntil } from '../src/lib/money';
import { goalProgress, leftLabel } from '../src/lib/ledger';

describe('problem 5: day-to-day estimate', () => {
  const day = (d: number) => `2026-11-${String(d).padStart(2, '0')}`;
  it('divides by days tracked (min 14), not the full window', () => {
    const txs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(d => ({ type: 'expense', amount: 20000, date: day(d) }));
    const r = dailySpendingDetail(txs, day(20), 60);
    expect(r.days).toBe(20);
    expect(r.daily).toBe(10000);
  });
  it('floors very short history at 14 days', () => {
    const r = dailySpendingDetail([{ type: 'expense', amount: 70000, date: day(26) }], day(27), 60);
    expect(r.days).toBe(14);
    expect(r.daily).toBe(5000);
  });
  it('leaves out a one-off big buy', () => {
    const small = Array.from({ length: 20 }, (_, i) => ({ type: 'expense', amount: 30000, date: day(i + 1) }));
    const r = dailySpendingDetail([...small, { type: 'expense', amount: 2500000, date: day(15) }], day(30), 30);
    expect(r.oneOffs).toBe(1);
    expect(r.oneOffTotal).toBe(2500000);
    expect(r.daily).toBe(20000);
  });
  it('keeps planned payments out and needs 5+ spends before flagging one-offs', () => {
    const r = dailySpendingDetail([
      { type: 'expense', amount: 1000000, date: day(2), recurringId: 'r' },
      { type: 'expense', amount: 500000, date: day(3) }, { type: 'expense', amount: 10000, date: day(4) },
    ], day(30), 30);
    expect(r.oneOffs).toBe(0);
    expect(r.daily).toBe(Math.round(510000 / 29)); // tracking since the 2nd
  });
});

describe('problem 6: months to a deadline', () => {
  it('is fractional and month-length aware', () => {
    expect(monthsUntil('2026-11-30', '2027-01-01')).toBeCloseTo(1 + 2 / 31, 3);
    expect(monthsUntil('2026-11-01', '2026-11-30')).toBeCloseTo(29 / 30, 3);
    expect(monthsUntil('2026-01-31', '2026-03-01')).toBeGreaterThan(1);
    expect(monthsUntil('2026-11-27', '2026-11-27')).toBe(0);
    expect(monthsUntil('2026-11-27', '2026-10-01')).toBe(0);
  });
  it('asks for the whole gap when under a month is left, a monthly rate otherwise', () => {
    const g = { id: 'g', target: 1000000, startingSaved: 0, monthly: 0, annualRate: 0, deadline: '2026-12-10', accountIds: [] as string[] };
    const near = goalProgress(g, new Map(), [], '2026-11-27');
    expect(near.needed).toBe(1000000);
    expect(leftLabel(near.months)).toBe('under a month left');
    const far = goalProgress({ ...g, deadline: '2027-01-01' }, new Map(), [], '2026-11-30');
    expect(far.needed).toBe(Math.ceil(1000000 / far.months));
    expect(far.needed).toBeLessThan(1000000);
    expect(leftLabel(far.months)).toBe('1 month left');
  });
});

import { lastMonths, monthFlow } from '../src/lib/flow';

describe('home flow graph', () => {
  const txs = [
    { id: 'a', type: 'income', amount: 1000, date: '2026-11-02', accountId: 'x', toAccountId: null, categoryId: null, fee: 0, deletedAt: null },
    { id: 'b', type: 'expense', amount: 300, date: '2026-11-03', accountId: 'x', toAccountId: null, categoryId: null, fee: 0, deletedAt: null },
    { id: 'c', type: 'expense', amount: 200, date: '2026-10-15', accountId: 'x', toAccountId: null, categoryId: null, fee: 0, deletedAt: null },
  ];
  it('builds running totals for the month so far', () => {
    const f = monthFlow(txs as never, '2026-11-04');
    expect(f.days).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
    expect(f.inc).toEqual([0, 1000, 1000, 1000]);
    expect(f.out).toEqual([0, 0, 300, 300]);
  });
  it('totals the last six months, oldest first', () => {
    const m = lastMonths(txs as never, '2026-11-04');
    expect(m.map(x => x.key)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(m[4]).toEqual({ key: '2026-10', income: 0, expense: 200 });
    expect(m[5]).toEqual({ key: '2026-11', income: 1000, expense: 300 });
  });
});
