import { describe, expect, it } from 'vitest';
import { dailySpending, goalShare, nextPayday, payDays, planPaycheck } from '../src/lib/paycheck';

const bill = (name: string, amount: number, date = '2026-11-20') => ({ key: name, name, date, amount, source: 'recurring' });

describe('paycheck plan', () => {
  it('fills bills, day-to-day, goals, investing, then leaves the rest free', () => {
    const p = planPaycheck({ amount: 25_000_00, days: 15, bills: [bill('Rent', 8_000_00), bill('Internet', 1_699_00)], dailySpend: 400_00,
      goals: [{ id: 'g1', name: 'House', need: 3_000_00 }, { id: 'g2', name: 'Emergency', need: 1_000_00 }], investPct: 10 });
    expect(p.needs).toBe(9_699_00);
    expect(p.dayToDay).toBe(6_000_00);
    expect(p.save).toBe(4_000_00);
    expect(p.goals.map(g => g.put)).toEqual([3_000_00, 1_000_00]);
    expect(p.invest).toBe(2_500_00);
    expect(p.free).toBe(25_000_00 - 9_699_00 - 6_000_00 - 4_000_00 - 2_500_00);
    expect(p.shortfall).toBe(0);
    expect(p.needs + p.dayToDay + p.save + p.invest + p.free).toBe(25_000_00);
  });

  it('trims investing first, then goals, and reports a shortfall instead of trimming bills', () => {
    const tight = planPaycheck({ amount: 15_000_00, days: 15, bills: [bill('Rent', 8_000_00)], dailySpend: 400_00,
      goals: [{ id: 'g1', name: 'House', need: 3_000_00 }], investPct: 10 });
    expect(tight.dayToDay).toBe(6_000_00);
    expect(tight.save).toBe(1_000_00);
    expect(tight.invest).toBe(0);
    expect(tight.free).toBe(0);
    expect(tight.shortfall).toBe(0);

    const short = planPaycheck({ amount: 10_000_00, days: 15, bills: [bill('Rent', 8_000_00)], dailySpend: 400_00, goals: [], investPct: 10 });
    expect(short.needs).toBe(8_000_00);
    expect(short.dayToDay).toBe(2_000_00);
    expect(short.shortfall).toBe(4_000_00);
  });

  it('splits a partial goal amount in proportion and keeps every centavo', () => {
    const p = planPaycheck({ amount: 1_000_01, days: 0, bills: [], dailySpend: 0,
      goals: [{ id: 'a', name: 'A', need: 2_000_00 }, { id: 'b', name: 'B', need: 1_000_00 }], investPct: 0 });
    expect(p.save).toBe(1_000_01);
    expect(p.goals[0].put + p.goals[1].put).toBe(1_000_01);
    expect(p.goals[0].put).toBe(666_67);
  });

  it('finds the next payday, salary first', () => {
    const ids = new Set(['salary']);
    expect(nextPayday([{ date: '2026-11-18', categoryId: 'freelance' }, { date: '2026-11-30', categoryId: 'salary' }], '2026-11-15', ids)).toBe('2026-11-30');
    expect(nextPayday([{ date: '2026-11-18', categoryId: 'freelance' }], '2026-11-15', ids)).toBe('2026-11-18');
    expect(nextPayday([{ date: '2026-11-10', categoryId: 'salary' }], '2026-11-15', ids)).toBeNull();
    expect(payDays('2026-11-15', '2026-11-30')).toBe(15);
  });

  it('averages everyday spending and leaves out bills already counted', () => {
    const txs = [
      { type: 'expense', amount: 6_000_00, date: '2026-11-10' },
      { type: 'expense', amount: 8_000_00, date: '2026-11-05', recurringId: 'rent' },
      { type: 'expense', amount: 500_00, date: '2026-01-01' },
      { type: 'income', amount: 25_000_00, date: '2026-11-15' },
      { type: 'expense', amount: 1_000_00, date: '2026-11-12', deletedAt: 1 },
    ];
    expect(dailySpending(txs, '2026-11-23', 60)).toBe(100_00);
  });

  it('scales a goal to the length of the pay', () => {
    expect(goalShare(6_000_00, 0, 50_000_00, 15)).toBe(Math.round(6_000_00 * 15 / 30.44));
    expect(goalShare(1_000_00, 4_000_00, 500_00, 30)).toBe(500_00);
    // Your own monthly plan wins over a deadline that would eat the whole pay.
    expect(goalShare(10_000_00, 77_000_00, 2_800_000_00, 30)).toBe(Math.round(10_000_00 * 30 / 30.44));
    expect(goalShare(0, 3_000_00, 50_000_00, 30)).toBe(Math.round(3_000_00 * 30 / 30.44));
    expect(goalShare(1_000_00, 0, 0, 30)).toBe(0);
  });
});
