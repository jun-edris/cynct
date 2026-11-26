import { describe, expect, it } from 'vitest';
import { emergencyPlan, monthlyCosts, perMonthToClose } from '../src/lib/emergency';

describe('emergency fund', () => {
  it('builds a month of costs from bills, installments and day-to-day spending', () => {
    const e = monthlyCosts(
      [
        { kind: 'bill', amount: 150_000, frequency: 'monthly', active: true },
        { kind: 'bill', amount: 120_000, frequency: 'yearly', active: true }, // 100/mo
        { kind: 'bill', amount: 999_999, frequency: 'monthly', active: false }, // paused
        { kind: 'income', amount: 5_000_000, frequency: 'monthly', active: true }, // not a cost
      ],
      [{ monthlyAmount: 200_000, months: 12, paidCount: 3 }, { monthlyAmount: 50_000, months: 6, paidCount: 6 }],
      [
        { type: 'expense', amount: 900_000, date: '2026-11-20' }, // 9,000 over 90 days → 100/day
        { type: 'expense', amount: 500_000, date: '2026-11-20', recurringId: 'r1' }, // already a bill
        { type: 'income', amount: 100_000, date: '2026-11-20' },
      ],
      '2026-11-24',
    );
    expect(e).toEqual({ bills: 160_000, installments: 200_000, dayToDay: 304_400, total: 664_400 });
  });

  it('works out target, gap and months covered', () => {
    expect(emergencyPlan(2_000_000, 6, 3_000_000)).toEqual({ target: 12_000_000, gap: 9_000_000, pct: 0.25, covers: 1.5 });
    expect(emergencyPlan(2_000_000, 3, 9_000_000)).toMatchObject({ gap: 0, pct: 1, covers: 4.5 });
    expect(emergencyPlan(0, 6, 100)).toMatchObject({ target: 0, pct: 0, covers: 0 });
  });

  it('rounds the monthly amount up to the peso', () => {
    expect(perMonthToClose(9_000_050, 12)).toBe(750_100);
    expect(perMonthToClose(0, 12)).toBe(0);
  });
});
