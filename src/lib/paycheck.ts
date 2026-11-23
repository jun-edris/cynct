// Paycheck plan: splits one pay into what's already spoken for (bills due before the next payday),
// day-to-day spending, goals, investing, and what's truly free. Pure functions, unit tested.
// All amounts are in pesos (base currency) as integer centavos.
import { addDays, daysBetween } from './money';

export interface PlanBill { key: string; name: string; date: string; amount: number; source: string }
export interface PlanGoal { id: string; name: string; need: number }
export interface PaycheckInput {
  amount: number;
  days: number; // days this pay has to last (pay date up to, not including, the next payday)
  bills: PlanBill[];
  dailySpend: number; // typical day-to-day spending per day
  goals: PlanGoal[];
  investPct: number; // 0–100, share of the pay to invest
}
export interface PaycheckPlan {
  needs: number; dayToDay: number; save: number; invest: number; free: number;
  shortfall: number; // how much the plan is over the pay, after trimming investing and goals
  goals: (PlanGoal & { put: number })[];
  wanted: { needs: number; dayToDay: number; save: number; invest: number };
  share: (v: number) => number;
}

/**
 * Fills buckets in order of what can't wait: bills, then day-to-day, then goals, then investing.
 * When the pay runs out, later buckets shrink first; bills are never trimmed (the shortfall is reported instead).
 */
export function planPaycheck(p: PaycheckInput): PaycheckPlan {
  const amount = Math.max(0, Math.round(p.amount));
  const needs = p.bills.reduce((s, b) => s + b.amount, 0);
  const wantDay = Math.max(0, Math.round(p.dailySpend * Math.max(0, p.days)));
  const wantSave = p.goals.reduce((s, g) => s + Math.max(0, g.need), 0);
  const wantInvest = Math.round(amount * Math.min(100, Math.max(0, p.investPct)) / 100);

  let left = amount - needs;
  const dayToDay = Math.max(0, Math.min(wantDay, left));
  left -= dayToDay;
  const save = Math.max(0, Math.min(wantSave, left));
  left -= save;
  const invest = Math.max(0, Math.min(wantInvest, left));
  left -= invest;

  // Spread what goals got in proportion to what each needed; the last one takes the rounding.
  const goals = p.goals.map(g => ({ ...g, put: 0 }));
  if (save > 0 && wantSave > 0) {
    let given = 0;
    goals.forEach((g, i) => {
      g.put = i === goals.length - 1 ? save - given : Math.floor(save * Math.max(0, g.need) / wantSave);
      given += g.put;
    });
  }
  const shortfall = Math.max(0, needs + wantDay - amount);
  return {
    needs, dayToDay, save, invest, free: Math.max(0, left), shortfall, goals,
    wanted: { needs, dayToDay: wantDay, save: wantSave, invest: wantInvest },
    share: (v: number) => (amount > 0 ? v / amount : 0),
  };
}

/** The next expected income after the pay date, from planned income (salary first). Null if none is planned. */
export function nextPayday(
  incoming: { date: string; categoryId?: string | null }[], payDate: string, salaryIds: Set<string>,
): string | null {
  const after = incoming.filter(i => i.date > payDate).sort((a, b) => a.date.localeCompare(b.date));
  return (after.find(i => i.categoryId && salaryIds.has(i.categoryId)) ?? after[0])?.date ?? null;
}

/**
 * Typical everyday spending per day over the last `window` days: expenses that aren't planned
 * payments, installments or debt payments (those are already counted as bills).
 */
export function dailySpending(
  txs: { type: string; amount: number; date: string; deletedAt?: number | null; recurringId?: string | null; installmentId?: string | null; debtId?: string | null }[],
  today: string, window = 60,
): number {
  const from = addDays(today, -window);
  let total = 0;
  for (const t of txs) {
    if (t.deletedAt || t.type !== 'expense' || t.date <= from || t.date > today) continue;
    if (t.recurringId || t.installmentId || t.debtId) continue;
    total += t.amount;
  }
  return Math.round(total / window);
}

/**
 * What a goal should get from one pay, scaled to this pay's length: the monthly amount you set on the goal,
 * or what it needs to make its deadline when you haven't set one. Never more than what's left to save.
 */
export function goalShare(monthly: number, needed: number, left: number, days: number): number {
  if (left <= 0) return 0;
  const perMonth = monthly > 0 ? monthly : needed;
  return Math.min(left, Math.round(perMonth * days / 30.44));
}

export const payDays = (payDate: string, next: string) => Math.max(1, daysBetween(payDate, next));
