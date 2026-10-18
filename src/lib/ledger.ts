// Pure calculations. No React, no database — tested in tests/ledger.test.ts.
import { addDays, addMonths, daysBetween, futureValue, lastDayOfMonth, monthsBetween, parseISO, requiredMonthly, todayISO } from './money';

export interface TxLite {
  id: string; type: string; amount: number; fee?: number; accountId: string | null; toAccountId: string | null;
  categoryId: string | null; date: string; time?: string | null; debtId?: string | null; debtRole?: string | null;
  goalId?: string | null; note?: string; deletedAt?: number | null; counterparty?: string | null; tags?: string;
}
export interface AccountLite { id: string; type: string; opening: number; archived: boolean }
export interface CategoryLite { id: string; kind: string; parentId: string | null; name: string }

export const LIABILITY_TYPES = new Set(['credit', 'loan']);
export const isLiability = (type: string) => LIABILITY_TYPES.has(type);
export const live = <T extends { deletedAt?: number | null }>(txs: T[]) => txs.filter(t => !t.deletedAt);

/** Fees on transfers and outside sends are real spending; they're reported under this category. */
export const FEES_CATEGORY = 'fees';

// ---------- balances ----------
export function accountBalances(accounts: AccountLite[], txs: TxLite[]): Map<string, number> {
  const bal = new Map<string, number>(accounts.map(a => [a.id, a.opening]));
  const add = (id: string | null | undefined, v: number) => { if (id) bal.set(id, (bal.get(id) ?? 0) + v); };
  for (const t of txs) {
    if (t.deletedAt) continue;
    const fee = t.fee ?? 0;
    switch (t.type) {
      case 'expense': case 'debt_out': case 'goal_in': add(t.accountId, -t.amount); break;
      case 'income': case 'debt_in': case 'ext_in': case 'goal_out': add(t.accountId, t.amount); break;
      case 'adjust': add(t.accountId, t.amount); break;
      case 'ext_out': add(t.accountId, -(t.amount + fee)); break;
      case 'transfer': add(t.accountId, -(t.amount + fee)); add(t.toAccountId, t.amount); break;
      // goal_interest only changes the goal, not an account
    }
  }
  return bal;
}

export interface GoalLite {
  id: string; target: number; deadline: string; monthly: number; annualRate: number /* decimal */;
  accountIds: string[]; startingSaved: number;
}

/** Money held inside the goal itself: starting amount + contributions − withdrawals + interest. */
export function goalFund(goal: { id: string; startingSaved: number }, txs: TxLite[]): number {
  let v = goal.startingSaved;
  for (const t of txs) {
    if (t.deletedAt || t.goalId !== goal.id) continue;
    if (t.type === 'goal_in' || t.type === 'goal_interest') v += t.amount;
    if (t.type === 'goal_out') v -= t.amount;
  }
  return v;
}

export function goalProgress(g: GoalLite, bal: Map<string, number>, txs: TxLite[], today = todayISO()) {
  const fund = goalFund(g, txs);
  const linked = g.accountIds.reduce((s, id) => s + Math.max(0, bal.get(id) ?? 0), 0);
  const saved = fund + linked;
  const monthsLeft = Math.max(0, monthsBetween(today, g.deadline));
  const pct = g.target > 0 ? Math.min(1, Math.max(0, saved / g.target)) : 0;
  const needed = requiredMonthly(g.target, saved, monthsLeft, g.annualRate);
  const projected = Math.round(saved * Math.pow(1 + g.annualRate / 12, monthsLeft) + futureValue(g.monthly, monthsLeft, g.annualRate));
  let movedIn = 0, movedOut = 0, interest = 0;
  for (const t of txs) {
    if (t.deletedAt || t.goalId !== g.id) continue;
    if (t.type === 'goal_in') movedIn += t.amount;
    if (t.type === 'goal_out') movedOut += t.amount;
    if (t.type === 'goal_interest') interest += t.amount;
  }
  return { fund, linked, saved, pct, monthsLeft, needed, projected, onTrack: needed <= g.monthly, movedIn, movedOut, interest, left: Math.max(0, g.target - saved) };
}

/**
 * Monthly interest the goal should have been credited but hasn't yet. One entry per finished month,
 * dated the last day of that month, compounding on the goal's own fund (linked bank accounts earn their own).
 */
export function pendingInterest(
  g: { id: string; startingSaved: number; annualRate: number /* decimal */; interestCreditedThrough: string | null; createdDate: string },
  txs: TxLite[], today = todayISO(),
): { date: string; amount: number }[] {
  if (!(g.annualRate > 0)) return [];
  const out: { date: string; amount: number }[] = [];
  let monthEnd = g.interestCreditedThrough
    ? lastDayOfMonth(addMonths(`${g.interestCreditedThrough.slice(0, 7)}-01`, 1))
    : lastDayOfMonth(g.createdDate);
  let guard = 0;
  while (monthEnd < today && guard++ < 600) {
    let bal = g.startingSaved;
    for (const t of txs) {
      if (t.deletedAt || t.goalId !== g.id || t.date > monthEnd) continue;
      if (t.type === 'goal_in' || t.type === 'goal_interest') bal += t.amount;
      if (t.type === 'goal_out') bal -= t.amount;
    }
    for (const p of out) bal += p.amount;
    const amount = Math.round(Math.max(0, bal) * g.annualRate / 12);
    if (amount > 0) out.push({ date: monthEnd, amount });
    monthEnd = lastDayOfMonth(addMonths(`${monthEnd.slice(0, 7)}-01`, 1));
  }
  return out;
}

export function netWorth(accounts: AccountLite[], bal: Map<string, number>, goalFunds = 0) {
  let assets = goalFunds, liabilities = 0;
  for (const a of accounts) {
    if (a.archived) continue;
    const b = bal.get(a.id) ?? 0;
    if (b > 0) assets += b; else liabilities += b;
  }
  return { assets, liabilities, net: assets + liabilities };
}

// ---------- categories ----------
export function rootOf(catId: string | null, cats: CategoryLite[]): string | null {
  if (!catId) return null;
  const byId = new Map(cats.map(c => [c.id, c]));
  let cur = byId.get(catId);
  let guard = 0;
  while (cur?.parentId && guard++ < 10) cur = byId.get(cur.parentId) ?? undefined;
  return cur?.id ?? catId;
}

export function descendantsOf(catId: string, cats: CategoryLite[]): Set<string> {
  const out = new Set<string>([catId]);
  let added = true;
  while (added) {
    added = false;
    for (const c of cats) if (c.parentId && out.has(c.parentId) && !out.has(c.id)) { out.add(c.id); added = true; }
  }
  return out;
}

// ---------- periods ----------
export type Period = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';

/** Weeks start Monday. Bi-weekly periods count from the anchor date. Inclusive dates. */
export function periodRange(period: Period, date: string, anchor?: string): { start: string; end: string } {
  switch (period) {
    case 'daily': return { start: date, end: date };
    case 'monthly': return { start: `${date.slice(0, 7)}-01`, end: lastDayOfMonth(date) };
    case 'yearly': return { start: `${date.slice(0, 4)}-01-01`, end: `${date.slice(0, 4)}-12-31` };
    case 'biweekly': {
      const a = anchor ?? date;
      const n = Math.floor(daysBetween(a, date) / 14);
      const start = addDays(a, n * 14);
      return { start, end: addDays(start, 13) };
    }
    default: {
      const dow = (parseISO(date).getDay() + 6) % 7;
      const start = addDays(date, -dow);
      return { start, end: addDays(start, 6) };
    }
  }
}

export function nextPeriodStart(period: Period, start: string): string {
  if (period === 'daily') return addDays(start, 1);
  if (period === 'weekly') return addDays(start, 7);
  if (period === 'biweekly') return addDays(start, 14);
  if (period === 'monthly') return addMonths(start, 1);
  return addMonths(start, 12);
}

export function summarize(txs: TxLite[], start: string, end: string, cats: CategoryLite[] = []) {
  let income = 0, expense = 0;
  const byCategory = new Map<string, number>();
  const byRoot = new Map<string, number>();
  const incomeByRoot = new Map<string, number>();
  const addExp = (catId: string | null, amt: number) => {
    expense += amt;
    const c = catId ?? 'uncategorized';
    byCategory.set(c, (byCategory.get(c) ?? 0) + amt);
    const r = rootOf(catId, cats) ?? 'uncategorized';
    byRoot.set(r, (byRoot.get(r) ?? 0) + amt);
  };
  for (const t of txs) {
    if (t.deletedAt || t.date < start || t.date > end) continue;
    if (t.type === 'income') {
      income += t.amount;
      const r = rootOf(t.categoryId, cats) ?? 'uncategorized';
      incomeByRoot.set(r, (incomeByRoot.get(r) ?? 0) + t.amount);
    } else if (t.type === 'expense') addExp(t.categoryId, t.amount);
    if ((t.type === 'transfer' || t.type === 'ext_out') && (t.fee ?? 0) > 0) addExp(FEES_CATEGORY, t.fee!);
  }
  return { income, expense, net: income - expense, byCategory, byRoot, incomeByRoot };
}

export function monthRange(key: string) {
  return { start: `${key}-01`, end: lastDayOfMonth(`${key}-01`) };
}

/** Income and spending per day, for the calendar. */
export function dailyTotals(txs: TxLite[], start: string, end: string): Map<string, { income: number; expense: number }> {
  const out = new Map<string, { income: number; expense: number }>();
  for (const t of txs) {
    if (t.deletedAt || t.date < start || t.date > end) continue;
    const d = out.get(t.date) ?? { income: 0, expense: 0 };
    if (t.type === 'income') d.income += t.amount;
    if (t.type === 'expense') d.expense += t.amount;
    if ((t.type === 'transfer' || t.type === 'ext_out') && t.fee) d.expense += t.fee;
    out.set(t.date, d);
  }
  return out;
}

// ---------- budgets ----------
export interface BudgetLite { id: string; kind?: string; categoryId: string | null; period: string; amount: number; rollover: boolean; startDate: string }

function measured(b: BudgetLite, txs: TxLite[], cats: CategoryLite[], start: string, end: string) {
  const type = b.kind === 'income' ? 'income' : 'expense';
  const ids = b.categoryId ? descendantsOf(b.categoryId, cats) : null;
  let s = 0;
  for (const t of txs) {
    if (t.deletedAt || t.date < start || t.date > end) continue;
    if (type === 'expense' && (t.type === 'transfer' || t.type === 'ext_out') && t.fee) {
      if (!ids || ids.has(FEES_CATEGORY)) s += t.fee;
    }
    if (t.type !== type) continue;
    if (ids && !(t.categoryId && ids.has(t.categoryId))) continue;
    s += t.amount;
  }
  return s;
}

export function budgetStatus(b: BudgetLite, txs: TxLite[], cats: CategoryLite[], today = todayISO()) {
  const period = b.period as Period;
  const current = periodRange(period, today, b.startDate);
  const used = measured(b, txs, cats, current.start, current.end);
  let carry = 0;
  if (b.rollover) {
    let s = periodRange(period, b.startDate, b.startDate).start;
    let guard = 0;
    while (s < current.start && guard++ < 800) {
      const e = periodRange(period, s, b.startDate).end;
      carry += b.amount - measured(b, txs, cats, s, e);
      s = nextPeriodStart(period, s);
    }
  }
  const available = b.amount + carry;
  const remaining = available - used;
  const daysLeft = daysBetween(today, current.end) + 1;
  return { ...current, spent: used, carry, available, remaining, pct: available > 0 ? used / available : used > 0 ? 1 : 0, daysLeft, isIncome: b.kind === 'income' };
}

// ---------- recurring and planned payments ----------
export function advanceDue(frequency: string, due: string): string {
  switch (frequency) {
    case 'once': return due;
    case 'weekly': return addDays(due, 7);
    case 'quarterly': return addMonths(due, 3);
    case 'yearly': return addMonths(due, 12);
    case 'semimonthly': {
      const day = Number(due.slice(8, 10));
      const end = Number(lastDayOfMonth(due).slice(8, 10));
      const second = Math.min(30, end);
      if (day < 15) return `${due.slice(0, 7)}-15`;
      if (day < second) return `${due.slice(0, 7)}-${String(second).padStart(2, '0')}`;
      return `${addMonths(`${due.slice(0, 7)}-01`, 1).slice(0, 7)}-15`;
    }
    default: return addMonths(due, 1);
  }
}

export function nextPayday(from: string): string {
  const day = Number(from.slice(8, 10));
  if (day <= 15) return `${from.slice(0, 7)}-15`;
  const second = Math.min(30, Number(lastDayOfMonth(from).slice(8, 10)));
  if (day <= second) return `${from.slice(0, 7)}-${String(second).padStart(2, '0')}`;
  return `${addMonths(`${from.slice(0, 7)}-01`, 1).slice(0, 7)}-15`;
}

export function monthlyEquivalent(amount: number, frequency: string): number {
  switch (frequency) {
    case 'once': return 0;
    case 'weekly': return Math.round((amount * 52) / 12);
    case 'semimonthly': return amount * 2;
    case 'quarterly': return Math.round(amount / 3);
    case 'yearly': return Math.round(amount / 12);
    default: return amount;
  }
}

export function dueStatus(due: string, today = todayISO()): 'overdue' | 'today' | 'soon' | 'later' {
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  return daysBetween(today, due) <= 3 ? 'soon' : 'later';
}

export interface InstallmentLite { monthlyAmount: number; months: number; paidCount: number }
export function installmentStatus(i: InstallmentLite) {
  const left = Math.max(0, i.months - i.paidCount);
  return { left, remaining: left * i.monthlyAmount, total: i.months * i.monthlyAmount, pct: i.months ? Math.min(1, i.paidCount / i.months) : 1, done: left === 0 };
}

// ---------- debts and money owed to you ----------
export interface DebtLite { id: string; direction: string; principal: number; alreadyPaid?: number }
/** Total = starting amount + later borrowing. Paid = "already paid" + payments recorded since. */
export function debtStatus(d: DebtLite, txs: TxLite[]) {
  let borrowed = 0, payments = 0;
  for (const t of txs) {
    if (t.deletedAt || t.debtId !== d.id) continue;
    if (t.debtRole === 'borrow') borrowed += t.amount;
    if (t.debtRole === 'payment') payments += t.amount;
  }
  const total = d.principal + borrowed;
  const paid = (d.alreadyPaid ?? 0) + payments;
  const remaining = Math.max(0, total - paid);
  return { total, paid, borrowed, payments, remaining, pct: total ? Math.min(1, paid / total) : 1, settled: remaining === 0 };
}

// ---------- streaks ----------
/** Consecutive days with at least one entry. A streak survives until the end of the day after the last entry. */
export function streak(txs: TxLite[], today = todayISO()) {
  const days = new Set(txs.filter(t => !t.deletedAt && t.date <= today).map(t => t.date));
  const loggedToday = days.has(today);
  let cur = 0;
  let d = loggedToday ? today : addDays(today, -1);
  while (days.has(d)) { cur++; d = addDays(d, -1); }
  let best = 0, run = 0, prev: string | null = null;
  for (const day of [...days].sort()) {
    run = prev && addDays(prev, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return { current: cur, best, loggedToday, last7: Array.from({ length: 7 }, (_, i) => days.has(addDays(today, i - 6))) };
}

// ---------- upcoming and forecast ----------
export interface UpcomingItem {
  key: string; source: 'recurring' | 'installment' | 'card' | 'debt' | 'logged'; id: string; name: string; date: string;
  amount: number; direction: 'out' | 'in' | 'move'; expected: boolean;
}

export function upcoming(
  rec: { id: string; name: string; kind: string; amount: number; frequency: string; nextDue: string; endDate: string | null; active: boolean }[],
  inst: { id: string; name: string; monthlyAmount: number; months: number; paidCount: number; nextDue: string }[],
  today: string, days: number,
): UpcomingItem[] {
  const until = addDays(today, days);
  const out: UpcomingItem[] = [];
  for (const r of rec) {
    if (!r.active) continue;
    let d = r.nextDue, n = 0;
    while (d <= until && n++ < 400) {
      if (r.endDate && d > r.endDate) break;
      out.push({ key: `${r.id}:${d}`, source: 'recurring', id: r.id, name: r.name, date: d, amount: r.amount, expected: true,
        direction: r.kind === 'income' ? 'in' : r.kind === 'transfer' ? 'move' : 'out' });
      if (r.frequency === 'once') break;
      d = advanceDue(r.frequency, d);
    }
  }
  for (const i of inst) {
    let d = i.nextDue;
    for (let k = i.paidCount; k < i.months && d <= until; k++) {
      out.push({ key: `${i.id}:${d}`, source: 'installment', id: i.id, name: `${i.name} (${k + 1}/${i.months})`, date: d, amount: i.monthlyAmount, direction: 'out', expected: true });
      d = addMonths(d, 1);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/** Next date a given day-of-month falls on or after `from` (clamped to short months). */
export function nextDayOfMonth(day: number, from: string): string {
  const clamp = (iso: string) => {
    const last = Number(lastDayOfMonth(iso).slice(8, 10));
    return `${iso.slice(0, 7)}-${String(Math.min(day, last)).padStart(2, '0')}`;
  };
  const thisMonth = clamp(from);
  return thisMonth >= from ? thisMonth : clamp(addMonths(`${from.slice(0, 7)}-01`, 1));
}

export interface ForecastInput {
  accounts: (AccountLite & { name: string; dueDay: number | null })[];
  balances: Map<string, number>;
  txs: TxLite[];
  recurring: Parameters<typeof upcoming>[0];
  installments: Parameters<typeof upcoming>[1];
  debts: (DebtLite & { person: string; dueDate: string | null; closed: boolean })[];
}

export function forecast(input: ForecastInput, today: string, days: number) {
  const end = addDays(today, days);
  const items: UpcomingItem[] = upcoming(input.recurring, input.installments, today, days)
    .filter(i => i.direction !== 'move');
  for (const a of input.accounts) {
    if (a.archived || a.type !== 'credit' || !a.dueDay) continue;
    const owed = Math.max(0, -(input.balances.get(a.id) ?? 0));
    if (!owed) continue;
    const d = nextDayOfMonth(a.dueDay, today);
    if (d <= end) items.push({ key: `card:${a.id}`, source: 'card', id: a.id, name: `${a.name} statement`, date: d, amount: owed, direction: 'out', expected: true });
  }
  for (const d of input.debts) {
    if (d.closed || !d.dueDate || d.dueDate > end) continue;
    const s = debtStatus(d, input.txs);
    if (!s.remaining) continue;
    items.push({ key: `debt:${d.id}`, source: 'debt', id: d.id, name: d.direction === 'owe' ? `Pay ${d.person}` : `${d.person} pays back`,
      date: d.dueDate < today ? today : d.dueDate, amount: s.remaining, direction: d.direction === 'owe' ? 'out' : 'in', expected: true });
  }
  for (const t of input.txs) {
    if (t.deletedAt || t.date <= today || t.date > end) continue;
    const dir = t.type === 'income' || t.type === 'ext_in' ? 'in' : t.type === 'expense' || t.type === 'ext_out' ? 'out' : null;
    if (!dir) continue;
    items.push({ key: `tx:${t.id}`, source: 'logged', id: t.id, name: t.note || (dir === 'in' ? 'Income' : 'Expense'), date: t.date,
      amount: t.amount + (t.type === 'ext_out' ? t.fee ?? 0 : 0), direction: dir, expected: false });
  }
  items.sort((a, b) => a.date.localeCompare(b.date));

  // Starting point: money you can spend now (assets only; cards and loans are what you owe).
  const start = input.accounts.filter(a => !a.archived && !isLiability(a.type))
    .reduce((s, a) => s + (input.balances.get(a.id) ?? 0), 0);
  let actualIn = 0, actualOut = 0, expectedIn = 0, expectedOut = 0;
  for (const i of items) {
    if (i.direction === 'in') { if (i.expected) expectedIn += i.amount; else actualIn += i.amount; }
    if (i.direction === 'out') { if (i.expected) expectedOut += i.amount; else actualOut += i.amount; }
  }
  const series: { date: string; balance: number }[] = [];
  let running = start;
  for (let k = 0; k <= days; k++) {
    const d = addDays(today, k);
    for (const i of items) if (i.date === d) running += i.direction === 'in' ? i.amount : -i.amount;
    series.push({ date: d, balance: running });
  }
  const lowest = series.reduce((m, p) => (p.balance < m.balance ? p : m), series[0]);
  return { items, start, end: running, actualIn, actualOut, expectedIn, expectedOut, series, lowest };
}

// ---------- export ----------
export function toCSV(txs: TxLite[], accName: Map<string, string>, catName: Map<string, string>): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [['date', 'time', 'type', 'amount', 'fee', 'account', 'to_account', 'category', 'counterparty', 'note']];
  for (const t of [...txs].filter(x => !x.deletedAt).sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([t.date, t.time ?? '', t.type, (t.amount / 100).toFixed(2), ((t.fee ?? 0) / 100).toFixed(2), t.accountId ? accName.get(t.accountId) ?? '' : '',
      t.toAccountId ? accName.get(t.toAccountId) ?? '' : '', t.categoryId ? catName.get(t.categoryId) ?? '' : '', t.counterparty ?? '', t.note ?? '']);
  }
  return rows.map(r => r.map(esc).join(',')).join('\n');
}
