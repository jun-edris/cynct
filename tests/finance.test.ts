import { describe, expect, it } from 'vitest';
import { addOn, amortized, monthsToReach, splitBill } from '../src/lib/finance';

describe('loan calculators', () => {
  it('amortizes a bank loan and the schedule pays it off exactly', () => {
    const r = amortized(100_000_00, 0.12, 12);
    expect(r.monthly).toBe(888_488); // ₱8,884.88
    expect(r.schedule.at(-1)!.balance).toBe(0);
    expect(r.schedule.reduce((s, x) => s + x.principal, 0)).toBe(100_000_00);
    expect(r.totalInterest).toBeGreaterThan(6_600_00);
    expect(r.totalInterest).toBeLessThan(6_650_00);
  });

  it('handles zero interest', () => {
    expect(amortized(12_000_00, 0, 12).monthly).toBe(1_000_00);
  });

  it('shows the true cost of an add-on rate', () => {
    const r = addOn(100_000_00, 0.015, 12); // 1.5% a month add-on
    expect(r.totalInterest).toBe(18_000_00);
    expect(r.monthly).toBe(983_334);
    expect(r.effectiveAnnual).toBeGreaterThan(0.31);
    expect(r.effectiveAnnual).toBeLessThan(0.33);
    expect(r.schedule.reduce((s, x) => s + x.payment, 0)).toBe(r.totalPaid);
  });
});

describe('split and savings', () => {
  it('splits a bill with service charge, rounding up to the peso', () => {
    expect(splitBill(1_000_00, 3, 0.1)).toEqual({ perPerson: 36_700, total: 1_100_00, service: 100_00, remainder: 100 });
  });
  it('counts months to a target', () => {
    expect(monthsToReach(60_000_00, 0, 30_000_00)).toBe(2);
    expect(monthsToReach(100, 0, 0)).toBeNull();
    expect(monthsToReach(100, 200, 0)).toBe(0);
  });
});
