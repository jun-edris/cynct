// Emergency fund: how many months of must-pay costs you could cover with no income.
import { monthlyEquivalent } from './ledger';
import { dailySpending } from './paycheck';

type Rec = { kind: string; amount: number; frequency: string; active: boolean };
type Inst = { monthlyAmount: number; months: number; paidCount: number };
type Tx = Parameters<typeof dailySpending>[0][number];

export interface Essentials { bills: number; installments: number; dayToDay: number; total: number }

/** A month of costs from what the app already knows: planned bills, installments and your usual day-to-day spending (last 90 days). */
export function monthlyCosts(recurring: Rec[], installments: Inst[], txs: Tx[], today: string): Essentials {
  const bills = recurring.filter(r => r.active && r.kind === 'bill').reduce((s, r) => s + monthlyEquivalent(r.amount, r.frequency), 0);
  const inst = installments.filter(i => i.paidCount < i.months).reduce((s, i) => s + i.monthlyAmount, 0);
  const dayToDay = Math.round(dailySpending(txs, today, 90) * 30.44);
  return { bills, installments: inst, dayToDay, total: bills + inst + dayToDay };
}

export interface EmergencyPlan { target: number; gap: number; pct: number; covers: number }

/** Target for `months` of costs, what's still missing, and how many months what you have would last. */
export function emergencyPlan(monthly: number, months: number, saved: number): EmergencyPlan {
  const target = Math.max(0, Math.round(monthly * months));
  const have = Math.max(0, saved);
  return {
    target,
    gap: Math.max(0, target - have),
    pct: target > 0 ? Math.min(1, have / target) : 0,
    covers: monthly > 0 ? Math.floor((have / monthly) * 10) / 10 : 0,
  };
}

/** Even monthly amount to close the gap in `months`. */
export const perMonthToClose = (gap: number, months: number) => (gap > 0 && months > 0 ? Math.ceil(gap / months / 100) * 100 : 0);
