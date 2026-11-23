// Converts a backup from the old Bahay web app (PWA, before the rename to Cynct) into rows for the native database.
import type { Account, Budget, Category, Goal, Recurring, Transaction } from '../db/schema';
import { ACCOUNT_ICONS, DEFAULT_CATEGORIES } from './seed';
import { uid } from './money';

type Obj = Record<string, unknown>;
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v.filter(x => x && typeof x === 'object') as Obj[]) : []);

const ACCOUNT_TYPES = new Set(['cash', 'bank', 'ewallet', 'savings', 'credit', 'loan', 'investment']);
const FREQUENCIES = new Set(['weekly', 'monthly', 'semimonthly', 'quarterly', 'yearly']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface PwaImport {
  accounts: Account[]; categories: Category[]; transactions: Transaction[]; recurring: Recurring[];
  budgets: Budget[]; goals: Goal[]; settings: Record<string, unknown>; skipped: number;
}

export function isPwaBackup(data: unknown): boolean {
  return !!data && typeof data === 'object' && (data as Obj).app === 'bahay';
}

export function convertPwaBackup(data: unknown, now = Date.now()): PwaImport {
  if (!isPwaBackup(data)) throw new Error('This file is not a backup from the old Bahay web app.');
  const d = data as Obj;
  let skipped = 0;

  const accounts: Account[] = arr(d.accounts).map((a, i) => ({
    id: str(a.id) || uid(), name: str(a.name, 'Account'), type: ACCOUNT_TYPES.has(str(a.type)) ? str(a.type) : 'bank',
    color: str(a.color, '#FFB020'), icon: ACCOUNT_ICONS[str(a.type)] ?? 'wallet', currency: 'PHP', opening: Math.round(num(a.opening)),
    creditLimit: null, statementDay: null, dueDay: null, note: '',
    archived: !!a.archived, sort: i, createdAt: num(a.createdAt, now),
  }));
  const accountIds = new Set(accounts.map(a => a.id));

  const defaults = new Map(DEFAULT_CATEGORIES.map(c => [c.id, c]));
  const categories: Category[] = [...DEFAULT_CATEGORIES];
  for (const c of arr(d.categories)) {
    const id = str(c.id);
    if (!id || defaults.has(id)) continue; // built-ins share ids with the web app
    categories.push({ id, kind: str(c.kind) === 'income' ? 'income' : 'expense', name: str(c.name, 'Category'), parentId: null,
      color: str(c.color, '#7C879C'), icon: 'shape', keywords: JSON.stringify(Array.isArray(c.keywords) ? c.keywords : []), archived: false, sort: categories.length });
  }
  const categoryIds = new Set(categories.map(c => c.id));

  const transactions: Transaction[] = [];
  for (const t of arr(d.transactions)) {
    const type = str(t.type);
    const amount = Math.round(num(t.amount, NaN));
    const accountId = str(t.accountId);
    const toAccountId = str(t.toAccountId) || null;
    const date = str(t.date);
    const valid = ['expense', 'income', 'transfer', 'adjust'].includes(type) && Number.isFinite(amount) && accountIds.has(accountId)
      && DATE_RE.test(date) && (type === 'adjust' ? amount !== 0 : amount > 0)
      && (type !== 'transfer' || (toAccountId && accountIds.has(toAccountId) && toAccountId !== accountId));
    if (!valid) { skipped++; continue; }
    const categoryId = str(t.categoryId);
    transactions.push({
      id: str(t.id) || uid(), type, amount, fee: 0, toAmount: null, origAmount: null, origCurrency: null, accountId, toAccountId: type === 'transfer' ? toAccountId : null,
      categoryId: categoryId && categoryIds.has(categoryId) ? categoryId : null, date, time: null, note: str(t.note),
      counterparty: null, heldFor: null, photoUri: null, tags: '[]',
      recurringId: str(t.recurringId) || null, installmentId: null, debtId: null, debtRole: null, goalId: null, tripId: null, deletedAt: null,
      createdAt: num(t.createdAt, now), updatedAt: num(t.updatedAt, now),
    });
  }

  const recurring: Recurring[] = [];
  for (const r of arr(d.recurring)) {
    const accountId = str(r.accountId);
    const toAccountId = str(r.toAccountId) || null;
    if (!accountIds.has(accountId) || (toAccountId && !accountIds.has(toAccountId)) || !(num(r.amount) > 0) || !DATE_RE.test(str(r.nextDue))) { skipped++; continue; }
    const categoryId = str(r.categoryId);
    recurring.push({
      id: str(r.id) || uid(), name: str(r.name, 'Bill'), kind: toAccountId ? 'transfer' : 'bill', amount: Math.round(num(r.amount)),
      accountId, toAccountId, categoryId: categoryId && categoryIds.has(categoryId) ? categoryId : null,
      frequency: FREQUENCIES.has(str(r.frequency)) ? str(r.frequency) : 'monthly', nextDue: str(r.nextDue), endDate: null, debtId: null, active: true, createdAt: now,
    });
  }

  const budgets: Budget[] = arr(d.budgets)
    .filter(b => categoryIds.has(str(b.categoryId)) && num(b.limit) > 0)
    .map(b => ({ id: uid(), name: categories.find(c => c.id === str(b.categoryId))?.name ?? 'Budget', kind: 'expense', categoryId: str(b.categoryId),
      period: 'monthly', amount: Math.round(num(b.limit)), rollover: false, startDate: new Date(now).toISOString().slice(0, 8) + '01', createdAt: now }));

  const goals: Goal[] = arr(d.goals).filter(g => num(g.target) > 0 && DATE_RE.test(str(g.deadline))).map(g => ({
    id: str(g.id) || uid(), name: str(g.name, 'Goal'), target: Math.round(num(g.target)), deadline: str(g.deadline),
    monthly: Math.round(num(g.monthly)), annualRate: Math.round(num(g.annualRate) * 10_000),
    accountIds: JSON.stringify(Array.isArray(g.accountIds) ? (g.accountIds as unknown[]).filter(x => typeof x === 'string' && accountIds.has(x)) : []),
    startingSaved: 0, interestCreditedThrough: null, photoUri: null, note: '', color: '#FFB020', archived: false, createdAt: now,
  }));

  const meta = new Map(arr(d.meta).map(m => [str(m.key), m.value]));
  const def = meta.get('defaultAccountId');
  const settings: Record<string, unknown> = { setupDone: true };
  if (typeof def === 'string' && accountIds.has(def)) settings.defaultAccountId = def;

  return { accounts, categories, transactions, recurring, budgets, goals, settings, skipped };
}
