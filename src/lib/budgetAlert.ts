// Budget alerts: does a new spend push a budget past 80% or past its limit?
import { budgetStatus, type BudgetLite, type CategoryLite, type TxLite } from './ledger';

export interface Crossing { id: string; name: string; level: 80 | 100; pct: number; remaining: number }

/** Budgets that this new expense (in pesos) tips over 80% or 100% in their current period. Highest first. */
export function budgetCrossings(
  budgets: (BudgetLite & { name: string })[], txs: TxLite[], cats: CategoryLite[],
  add: { categoryId: string | null; amount: number; date: string }, today: string,
): Crossing[] {
  const fake: TxLite = { id: '__new', type: 'expense', amount: add.amount, date: add.date, accountId: null, toAccountId: null, categoryId: add.categoryId, fee: 0, deletedAt: null };
  const out: Crossing[] = [];
  for (const b of budgets) {
    if (b.kind === 'income') continue;
    const before = budgetStatus(b, txs, cats, today);
    if (add.date < before.start || add.date > before.end) continue;
    const after = budgetStatus(b, [...txs, fake], cats, today);
    if (after.spent === before.spent) continue; // this spend doesn't count toward it
    const level = before.pct < 1 && after.pct >= 1 ? 100 : before.pct < 0.8 && after.pct >= 0.8 ? 80 : null;
    if (level) out.push({ id: b.id, name: b.name, level, pct: after.pct, remaining: after.remaining });
  }
  return out.sort((a, b) => b.level - a.level || b.pct - a.pct);
}

export function crossingText(c: Crossing, fmt: (n: number) => string): string {
  return c.level === 100
    ? `${c.name} budget is over by ${fmt(-c.remaining)}`
    : `${c.name} budget is at ${Math.round(c.pct * 100)}%, ${fmt(c.remaining)} left`;
}
