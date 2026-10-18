import { describe, expect, it } from 'vitest';
import { buildRecap } from '../src/lib/recap';

const tx = (id: string, type: string, amount: number, date: string, categoryId: string | null = null) =>
  ({ id, type, amount, date, categoryId, accountId: 'a', toAccountId: null, note: id });
const cats = [{ id: 'food', kind: 'expense', parentId: null, name: 'Food' }, { id: 'food.x', kind: 'expense', parentId: 'food', name: 'Eat out' },
  { id: 'bills', kind: 'expense', parentId: null, name: 'Bills' }, { id: 'salary', kind: 'income', parentId: null, name: 'Salary' }];

describe('recap', () => {
  const txs = [
    tx('pay', 'income', 10_000_000, '2026-09-15', 'salary'),
    tx('l1', 'expense', 20_000, '2026-09-01', 'food.x'), tx('l2', 'expense', 30_000, '2026-09-02', 'food'),
    tx('l3', 'expense', 500_000, '2026-09-03', 'bills'), tx('l4', 'expense', 10_000, '2026-09-05', 'food.x'),
    tx('out', 'expense', 999, '2026-10-01', 'food'),
  ];
  const r = buildRecap(txs, cats, '2026-09-01', '2026-09-30');
  it('totals, savings rate and top categories by root', () => {
    expect(r.expense).toBe(560_000);
    expect(r.income).toBe(10_000_000);
    expect(r.savingsRate).toBeCloseTo(0.944, 3);
    expect(r.top[0]).toMatchObject({ id: 'bills', amount: 500_000 });
    expect(r.top[1]).toMatchObject({ id: 'food', amount: 60_000 });
  });
  it('days logged, best streak, biggest and busiest', () => {
    expect(r.daysLogged).toBe(5);
    expect(r.bestStreak).toBe(3);
    expect(r.biggest?.id).toBe('l3');
    expect(r.busiest).toEqual({ date: '2026-09-03', amount: 500_000 });
    expect(r.personality.title).toBe('The Builder');
  });
  it('spending more than income is called out', () => {
    const s = buildRecap([...txs, tx('big', 'expense', 20_000_000, '2026-09-20', 'bills')], cats, '2026-09-01', '2026-09-30');
    expect(s.personality.title).toBe('The Stretcher');
  });
});
