import { describe, expect, it } from 'vitest';
import { toCentavos, toSignedCentavos, peso, addMonths, requiredMonthly, futureValue } from '../src/lib/money';
import { parseQuickEntry, type ParseCategory } from '../src/lib/parse';
import {
  accountBalances, netWorth, summarize, budgetStatus, periodRange, advanceDue, nextPayday, monthlyEquivalent,
  installmentStatus, debtStatus, upcoming, goalProgress, rootOf, toCSV, streak, forecast, dailyTotals, nextDayOfMonth,
} from '../src/lib/ledger';
import { DEFAULT_CATEGORIES, mySetup } from '../src/lib/seed';
import { convertPwaBackup } from '../src/lib/importPwa';

const cats: ParseCategory[] = DEFAULT_CATEGORIES.map(c => ({ ...c, keywords: JSON.parse(c.keywords) }));
const accounts = [
  { id: 'gc', name: 'GCash' }, { id: 'wi', name: 'Wise' }, { id: 'hf', name: 'House fund' }, { id: 'go', name: 'GoTyme Savings' },
];
const ctx = { accounts, categories: cats, defaultAccountId: 'gc', today: '2026-10-18' };

describe('money', () => {
  it('parses amounts', () => {
    expect(toCentavos('1,234.50')).toBe(123450);
    expect(toCentavos('2.5k')).toBe(250000);
    expect(toCentavos('2.8m')).toBe(280000000);
    expect(toCentavos('1.234')).toBeNaN();
    expect(toSignedCentavos('-12,500')).toBe(-1250000);
    expect(toSignedCentavos('−300')).toBe(-30000);
  });
  it('formats pesos', () => {
    expect(peso(123450)).toBe('₱1,234.50');
    expect(peso(-500000)).toBe('−₱5,000');
  });
  it('savings formulas match the plan', () => {
    expect(futureValue(70000_00, 34, 0.06) / 100).toBeGreaterThan(2_580_000);
    expect(requiredMonthly(2_800_000_00, 0, 36, 0.06) / 100).toBeCloseTo(71_190, -2);
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });
});

describe('quick entry', () => {
  it('maps keywords to subcategories', () => {
    const r = parseQuickEntry('lunch 180 gcash', ctx);
    expect([r.type, r.amount, r.accountId, r.categoryId, r.note]).toEqual(['expense', 18000, 'gc', 'food.eatout', 'lunch']);
  });
  it('prefers a subcategory name over parent keywords', () => {
    expect(parseQuickEntry('groceries 1.2k', ctx).categoryId).toBe('food.groceries');
    expect(parseQuickEntry('gas 250', ctx).categoryId).toBe('transport.gas');
  });
  it('detects income and transfers', () => {
    expect(parseQuickEntry('+100k salary wise', ctx)).toMatchObject({ type: 'income', amount: 10000000, accountId: 'wi', categoryId: 'salary' });
    expect(parseQuickEntry('70k wise > house fund', ctx)).toMatchObject({ type: 'transfer', accountId: 'wi', toAccountId: 'hf' });
    expect(parseQuickEntry('5000 gotyme to gcash', ctx)).toMatchObject({ type: 'transfer', accountId: 'go', toAccountId: 'gc' });
  });
  it('handles yesterday and errors', () => {
    expect(parseQuickEntry('spotify 149 yesterday', ctx)).toMatchObject({ date: '2026-10-17', categoryId: 'subs', amount: 14900 });
    expect(parseQuickEntry('food gcash', ctx).errors.join()).toMatch(/amount/);
    expect(parseQuickEntry('5k to wise', ctx).errors.join()).toMatch(/both accounts/);
  });
});

describe('ledger', () => {
  const accs = [
    { id: 'wi', type: 'bank', opening: 0, archived: false },
    { id: 'cc', type: 'credit', opening: -500000, archived: false },
    { id: 'hf', type: 'savings', opening: 0, archived: false },
  ];
  const txs = [
    { id: '1', type: 'income', amount: 10000000, accountId: 'wi', toAccountId: null, categoryId: 'salary', date: '2026-10-15' },
    { id: '2', type: 'transfer', amount: 3500000, accountId: 'wi', toAccountId: 'hf', categoryId: null, date: '2026-10-15' },
    { id: '3', type: 'expense', amount: 18000, accountId: 'cc', toAccountId: null, categoryId: 'food.eatout', date: '2026-10-16' },
    { id: '4', type: 'expense', amount: 120000, accountId: 'wi', toAccountId: null, categoryId: 'food.groceries', date: '2026-10-17' },
    { id: '5', type: 'transfer', amount: 200000, accountId: 'wi', toAccountId: 'cc', categoryId: null, date: '2026-10-17' },
  ];
  it('computes balances including credit cards', () => {
    const b = accountBalances(accs, txs);
    expect(b.get('cc')).toBe(-500000 - 18000 + 200000);
    expect(b.get('hf')).toBe(3500000);
    const nw = netWorth(accs, b);
    expect(nw.liabilities).toBe(-318000);
    expect(nw.net).toBe(nw.assets - 318000);
  });
  it('rolls subcategories up to their parent', () => {
    const s = summarize(txs, '2026-10-01', '2026-10-31', DEFAULT_CATEGORIES);
    expect(s.expense).toBe(138000); // transfers and card payments are not spending
    expect(s.byRoot.get('food')).toBe(138000);
    expect(rootOf('food.coffee', DEFAULT_CATEGORIES)).toBe('food');
  });
  it('weeks start on Monday', () => {
    expect(periodRange('weekly', '2026-10-18')).toEqual({ start: '2026-10-12', end: '2026-10-18' }); // Sunday
    expect(periodRange('weekly', '2026-10-19').start).toBe('2026-10-19');
  });
  it('budgets include subcategories and roll over leftovers', () => {
    const b = { id: 'b', categoryId: 'food', period: 'monthly', amount: 500000, rollover: true, startDate: '2026-09-01' };
    const t = [
      { id: 'a', type: 'expense', amount: 300000, accountId: 'wi', toAccountId: null, categoryId: 'food.groceries', date: '2026-09-10' },
      { id: 'b', type: 'expense', amount: 100000, accountId: 'wi', toAccountId: null, categoryId: 'food.eatout', date: '2026-10-02' },
      { id: 'c', type: 'expense', amount: 99999, accountId: 'wi', toAccountId: null, categoryId: 'wants', date: '2026-10-02' },
    ];
    const s = budgetStatus(b, t, DEFAULT_CATEGORIES, '2026-10-18');
    expect(s.carry).toBe(200000);
    expect(s.available).toBe(700000);
    expect(s.spent).toBe(100000);
    expect(s.remaining).toBe(600000);
    expect(budgetStatus({ ...b, rollover: false }, t, DEFAULT_CATEGORIES, '2026-10-18').remaining).toBe(400000);
    expect(budgetStatus({ ...b, categoryId: null }, t, DEFAULT_CATEGORIES, '2026-10-18').spent).toBe(199999);
  });
  it('semimonthly paydays and other frequencies', () => {
    expect(advanceDue('semimonthly', '2026-10-15')).toBe('2026-10-30');
    expect(advanceDue('semimonthly', '2026-10-30')).toBe('2026-11-15');
    expect(advanceDue('semimonthly', '2027-02-15')).toBe('2027-02-28');
    expect(advanceDue('weekly', '2026-10-18')).toBe('2026-10-25');
    expect(nextPayday('2026-10-18')).toBe('2026-10-30');
    expect(nextPayday('2026-10-31')).toBe('2026-11-15');
    expect(monthlyEquivalent(50000, 'quarterly')).toBe(16667);
  });
  it('installments and debts', () => {
    expect(installmentStatus({ monthlyAmount: 250000, months: 12, paidCount: 3 })).toMatchObject({ left: 9, remaining: 2250000 });
    const owe = { id: 'd1', direction: 'owe', principal: 1000000 };
    const t = [
      { id: 'x', type: 'debt_in', amount: 1000000, accountId: 'wi', toAccountId: null, categoryId: null, date: '2026-10-01', debtId: 'd1', debtRole: 'start' },
      { id: 'y', type: 'debt_out', amount: 400000, accountId: 'wi', toAccountId: null, categoryId: null, date: '2026-10-10', debtId: 'd1', debtRole: 'payment' },
    ];
    expect(debtStatus(owe, t)).toMatchObject({ paid: 400000, remaining: 600000, settled: false });
    expect(summarize(t, '2026-10-01', '2026-10-31').expense).toBe(0); // debt movements are not income or spending
  });
  it('lists upcoming bills, income and installments in date order', () => {
    const list = upcoming(
      [{ id: 'r', name: 'Salary', kind: 'income', amount: 1, frequency: 'semimonthly', nextDue: '2026-10-30', endDate: null, active: true }],
      [{ id: 'i', name: 'Phone', monthlyAmount: 2, months: 3, paidCount: 1, nextDue: '2026-10-20' }],
      '2026-10-18', 33); // through Nov 20
    expect(list.map(x => `${x.date} ${x.name}`)).toEqual(['2026-10-20 Phone (2/3)', '2026-10-30 Salary', '2026-11-15 Salary', '2026-11-20 Phone (3/3)']);
  });
  it('goal progress', () => {
    const g = goalProgress({ id: 'g', startingSaved: 0, target: 2_800_000_00, deadline: '2029-10-18', monthly: 70000_00, annualRate: 0.06, accountIds: ['hf'] },
      new Map([['hf', 280_000_00]]), [], '2026-10-18');
    expect(g.pct).toBe(0.1);
    expect(g.onTrack).toBe(true);
  });
  it('CSV escapes quotes', () => {
    const csv = toCSV([{ id: '1', type: 'expense', amount: 100, accountId: 'a', toAccountId: null, categoryId: null, date: '2026-01-01', note: 'a, "b"' }], new Map(), new Map());
    expect(csv).toContain('"a, ""b"""');
  });
});

describe('seed and PWA import', () => {
  it('my setup has a house goal and paydays', () => {
    const s = mySetup('2026-10-18');
    expect(s.goals[0].target).toBe(2_800_000_00);
    expect(s.recurring.find(r => r.name === 'Salary')?.nextDue).toBe('2026-10-30');
  });
  it('converts a web app backup and skips bad rows', () => {
    const backup = {
      app: 'bahay', version: 1,
      accounts: [{ id: 'a1', name: 'GCash', type: 'ewallet', opening: 0 }, { id: 'a2', name: 'House fund', type: 'savings', opening: 0 }],
      categories: [{ id: 'food', kind: 'expense', name: 'Food' }, { id: 'mine', kind: 'expense', name: 'Pets', keywords: ['cat'] }],
      transactions: [
        { id: 't1', type: 'expense', amount: 18000, accountId: 'a1', categoryId: 'food', date: '2026-10-16', note: 'lunch' },
        { id: 't2', type: 'transfer', amount: 100, accountId: 'a1', toAccountId: 'a1', date: '2026-10-16' }, // invalid: same account
        { id: 't3', type: 'expense', amount: 500, accountId: 'nope', date: '2026-10-16' }, // invalid: missing account
      ],
      recurring: [{ id: 'r1', name: 'Save', amount: 3500000, accountId: 'a1', toAccountId: 'a2', frequency: 'semimonthly', nextDue: '2026-10-30' }],
      budgets: [{ categoryId: 'food', limit: 500000 }],
      goals: [{ id: 'g', name: 'Bahay', target: 280000000, deadline: '2029-10-18', monthly: 7000000, accountIds: ['a2', 'ghost'], annualRate: 0.06 }],
      meta: [{ key: 'defaultAccountId', value: 'a1' }],
    };
    const p = convertPwaBackup(backup);
    expect(p.transactions).toHaveLength(1);
    expect(p.skipped).toBe(2);
    expect(p.categories.find(c => c.id === 'mine')?.name).toBe('Pets');
    expect(p.recurring[0].kind).toBe('transfer');
    expect(p.goals[0].annualRate).toBe(600);
    expect(JSON.parse(p.goals[0].accountIds)).toEqual(['a2']);
    expect(p.settings.defaultAccountId).toBe('a1');
  });
});

describe('build 1 rules', () => {
  const accs = [{ id: 'wi', type: 'bank', opening: 1000000, archived: false }, { id: 'gc', type: 'ewallet', opening: 0, archived: false },
    { id: 'cc', type: 'credit', opening: -300000, archived: false }];
  const base = { toAccountId: null, categoryId: null };
  it('transfer and outside-send fees leave the account and count as spending under Fees', () => {
    const txs = [
      { ...base, id: '1', type: 'transfer', amount: 500000, fee: 1500, accountId: 'wi', toAccountId: 'gc', date: '2026-10-18' },
      { ...base, id: '2', type: 'ext_out', amount: 200000, fee: 2500, accountId: 'gc', counterparty: 'Mama', date: '2026-10-18' },
      { ...base, id: '3', type: 'ext_in', amount: 100000, accountId: 'gc', counterparty: 'Client', date: '2026-10-18' },
    ];
    const b = accountBalances(accs, txs);
    expect(b.get('wi')).toBe(1000000 - 501500);
    expect(b.get('gc')).toBe(500000 - 202500 + 100000);
    const s = summarize(txs, '2026-10-01', '2026-10-31', DEFAULT_CATEGORIES);
    expect(s.expense).toBe(4000);
    expect(s.income).toBe(0); // money received for someone else isn't income
    expect(s.byRoot.get('fees')).toBe(4000);
    expect(dailyTotals(txs, '2026-10-01', '2026-10-31').get('2026-10-18')).toEqual({ income: 0, expense: 4000 });
  });
  it('deleted transactions are ignored everywhere', () => {
    const txs = [{ ...base, id: '1', type: 'expense', amount: 999, accountId: 'wi', date: '2026-10-18', deletedAt: 1 }];
    expect(accountBalances(accs, txs).get('wi')).toBe(1000000);
    expect(summarize(txs, '2026-10-01', '2026-10-31').expense).toBe(0);
  });
  it('daily, bi-weekly and income budgets', () => {
    const t = [
      { ...base, id: 'a', type: 'expense', amount: 30000, accountId: 'wi', categoryId: 'food.coffee', date: '2026-10-18' },
      { ...base, id: 'b', type: 'expense', amount: 50000, accountId: 'wi', categoryId: 'food', date: '2026-10-10' },
      { ...base, id: 'c', type: 'income', amount: 5000000, accountId: 'wi', categoryId: 'salary', date: '2026-10-15' },
    ];
    expect(budgetStatus({ id: 'd', categoryId: 'food', period: 'daily', amount: 50000, rollover: false, startDate: '2026-10-01' }, t, DEFAULT_CATEGORIES, '2026-10-18').spent).toBe(30000);
    expect(periodRange('biweekly', '2026-10-18', '2026-10-01')).toEqual({ start: '2026-10-15', end: '2026-10-28' });
    const bw = budgetStatus({ id: 'w', categoryId: 'food', period: 'biweekly', amount: 100000, rollover: true, startDate: '2026-10-01' }, t, DEFAULT_CATEGORIES, '2026-10-18');
    expect(bw.spent).toBe(30000);
    expect(bw.carry).toBe(50000); // Oct 1–14 used 50k of 100k
    const inc = budgetStatus({ id: 'i', kind: 'income', categoryId: null, period: 'monthly', amount: 10000000, rollover: false, startDate: '2026-10-01' }, t, DEFAULT_CATEGORIES, '2026-10-18');
    expect(inc).toMatchObject({ spent: 5000000, isIncome: true, remaining: 5000000 });
  });
  it('streaks count consecutive logging days', () => {
    const d = (date: string) => ({ ...base, id: date, type: 'expense', amount: 1, accountId: 'wi', date });
    const s = streak([d('2026-10-15'), d('2026-10-16'), d('2026-10-17'), d('2026-10-10'), d('2026-10-11')], '2026-10-18');
    expect(s).toMatchObject({ current: 3, best: 3, loggedToday: false });
    expect(streak([d('2026-10-15')], '2026-10-18').current).toBe(0);
    expect(s.last7).toEqual([false, false, false, true, true, true, false]);
  });
  it('forecast: card statements, debts due, planned income, and a running balance', () => {
    expect(nextDayOfMonth(31, '2027-02-10')).toBe('2027-02-28');
    expect(nextDayOfMonth(5, '2026-10-18')).toBe('2026-11-05');
    const f = forecast({
      accounts: [
        { id: 'wi', name: 'Wise', type: 'bank', opening: 1000000, archived: false, dueDay: null },
        { id: 'cc', name: 'BPI Card', type: 'credit', opening: -300000, archived: false, dueDay: 25 },
      ],
      balances: new Map([['wi', 1000000], ['cc', -300000]]),
      txs: [{ ...base, id: 'f', type: 'expense', amount: 10000, accountId: 'wi', date: '2026-10-20', note: 'Dentist' }],
      recurring: [{ id: 'r', name: 'Salary', kind: 'income', amount: 5000000, frequency: 'semimonthly', nextDue: '2026-10-30', endDate: null, active: true }],
      installments: [],
      debts: [{ id: 'd', direction: 'owe', principal: 200000, person: 'Kuya', dueDate: '2026-10-22', closed: false }],
    }, '2026-10-18', 14);
    expect(f.start).toBe(1000000);
    expect(f.items.map(i => i.name)).toEqual(['Dentist', 'Pay Kuya', 'BPI Card statement', 'Salary']);
    expect(f).toMatchObject({ actualOut: 10000, expectedOut: 500000, expectedIn: 5000000 });
    expect(f.lowest.balance).toBe(1000000 - 10000 - 200000 - 300000);
    expect(f.end).toBe(1000000 - 510000 + 5000000);
  });
  it('one-time planned items appear once', () => {
    const list = upcoming([{ id: 'o', name: 'Lot reservation', kind: 'bill', amount: 1, frequency: 'once', nextDue: '2026-10-20', endDate: null, active: true }], [], '2026-10-18', 60);
    expect(list).toHaveLength(1);
  });
});

import { evaluate, press } from '../src/lib/calc';
describe('keypad calculator', () => {
  it('evaluates with precedence and percent', () => {
    expect(evaluate('120+80×2')).toBe(280);
    expect(evaluate('1000−10%')).toBe(999.9);
    expect(evaluate('100÷3')).toBe(33.33);
    expect(evaluate('5÷0')).toBeNaN();
    expect(evaluate('50+')).toBe(50);
  });
  it('builds input sensibly', () => {
    const keys = (ks: string[]) => ks.reduce(press, '');
    expect(keys(['1', '2', '.', '5', '0', '9'])).toBe('12.50');
    expect(keys(['0', '0', '5'])).toBe('5');
    expect(keys(['+', '1', '+', '×', '2', '='])).toBe('2');
    expect(keys(['.', '5'])).toBe('0.5');
    expect(keys(['9', '⌫', '7'])).toBe('7');
  });
});

describe('typing amounts with thousands separators', () => {
  it('groups as you type and keeps what parses', async () => {
    const { groupDigits, toCentavos } = await import('../src/lib/money');
    expect(groupDigits('1234')).toBe('1,234');
    expect(groupDigits('1,2345')).toBe('12,345');
    expect(groupDigits('1234567.891')).toBe('1,234,567.89');
    expect(groupDigits('0012')).toBe('12');
    expect(groupDigits('.5')).toBe('0.5');
    expect(groupDigits('100.')).toBe('100.');
    expect(groupDigits('1..2.3')).toBe('1.23');
    expect(groupDigits('58.250000', 6)).toBe('58.250000');
    expect(groupDigits('2.5k')).toBe('2.5k');
    expect(groupDigits('')).toBe('');
    expect(groupDigits('-12500')).toBe('-12,500');
    expect(groupDigits('-')).toBe('-');
    expect(toCentavos(groupDigits('1234567.8'))).toBe(123456780);
  });
  it('privacy mode hides every formatted amount', async () => {
    const m = await import('../src/lib/money');
    m.setMasked(true);
    expect(m.peso(123456)).toBe('₱••••');
    expect(m.compactPeso(10_000_000)).toBe('₱••••');
    m.setMasked(false);
    expect(m.peso(123456)).toBe('₱1,234.56');
  });
});
