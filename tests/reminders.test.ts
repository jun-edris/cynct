import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, planReminders } from '../src/lib/reminders';

const today = '2026-10-18';
const base = {
  recurring: [
    { id: 'r1', name: 'Internet', kind: 'bill', amount: 140000, nextDue: '2026-10-20', active: true },
    { id: 'r2', name: 'Salary', kind: 'income', amount: 5000000, nextDue: '2026-10-30', active: true },
    { id: 'r3', name: 'Old', kind: 'bill', amount: 100, nextDue: '2026-10-19', active: false },
    { id: 'r4', name: 'Far', kind: 'bill', amount: 100, nextDue: '2027-01-01', active: true },
  ],
  installments: [{ id: 'i1', name: 'Phone', monthlyAmount: 200000, months: 12, paidCount: 3, nextDue: '2026-10-25' }],
  debts: [{ id: 'd1', direction: 'owe', person: 'Kuya', principal: 1000000, alreadyPaid: 0, dueDate: '2026-11-01', closed: false }],
  accounts: [{ id: 'cc', name: 'BPI card', type: 'credit', archived: false, dueDay: 25 }],
  balances: new Map([['cc', -500000]]),
  goals: [{ id: 'g1', name: 'Laptop', deadline: '2026-11-10', archived: false, target: 1 }],
  txs: [],
};

describe('reminders', () => {
  it('plans nothing when turned off', () => {
    expect(planReminders(base, DEFAULT_PREFS, today)).toEqual([]);
  });
  it('plans bills (with a day-before heads-up), income, installments, debts, cards and goals', () => {
    const r = planReminders(base, { ...DEFAULT_PREFS, enabled: true }, today);
    const keys = r.map(x => `${x.date} ${x.title}`);
    expect(keys).toContain('2026-10-19 Internet is due tomorrow');
    expect(keys).toContain('2026-10-20 Internet is due today');
    expect(keys).toContain('2026-10-30 Salary expected today');
    expect(keys).toContain('2026-10-25 Phone payment due');
    expect(keys).toContain('2026-10-29 Payment to Kuya due in 3 days');
    expect(keys).toContain('2026-10-23 BPI card payment due in 2 days');
    expect(keys).toContain('2026-11-03 Laptop: target date a week away');
    expect(keys.some(k => k.includes('Old') || k.includes('Far'))).toBe(false);
    expect(r.map(x => x.date)).toEqual([...r.map(x => x.date)].sort());
  });
  it('respects each switch', () => {
    const r = planReminders(base, { ...DEFAULT_PREFS, enabled: true, bills: false, cards: false }, today);
    expect(r.some(x => x.url.startsWith('/recurring') || x.url.startsWith('/installment') || x.url.startsWith('/account'))).toBe(false);
  });
});
