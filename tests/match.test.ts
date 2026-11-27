import { describe, expect, it } from 'vitest';
import { findRecorded, matchPlan, type PlanLite } from '../src/lib/match';
import { RATE_SCALE } from '../src/lib/currency';

const rates = new Map([['USD', Math.round(63.8 * RATE_SCALE)]]);
const at = (iso: string, h = 9) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)), h).getTime();
const dale: PlanLite = { id: 'dale', name: 'Web services | Client - Dale', kind: 'income', amount: 5_500, accountId: 'wise-usd', nextDue: '2026-11-30', active: true, currency: 'USD' };
const internet: PlanLite = { id: 'net', name: 'Internet', kind: 'bill', amount: 169_900, accountId: 'maya', nextDue: '2026-12-01', active: true, currency: 'PHP' };

describe('captured payment ↔ planned payment', () => {
  it('ties Dale’s $55 on Wise to the weekly plan', () => {
    expect(matchPlan({ kind: 'income', amount: 5_500, currency: 'USD', postedAt: at('2026-11-30'), accountId: 'wise-usd' }, [dale, internet], rates)?.id).toBe('dale');
  });
  it('allows a day or three either side and a small fee', () => {
    expect(matchPlan({ kind: 'income', amount: 5_350, currency: 'USD', postedAt: at('2026-12-02'), accountId: 'wise-usd' }, [dale], rates)?.id).toBe('dale');
    expect(matchPlan({ kind: 'income', amount: 5_500, currency: 'USD', postedAt: at('2026-12-04'), accountId: 'wise-usd' }, [dale], rates)).toBeNull();
    expect(matchPlan({ kind: 'income', amount: 4_000, currency: 'USD', postedAt: at('2026-11-30'), accountId: 'wise-usd' }, [dale], rates)).toBeNull();
  });
  it('needs the same direction and account, or the same currency when no account is linked', () => {
    expect(matchPlan({ kind: 'expense', amount: 5_500, currency: 'USD', postedAt: at('2026-11-30'), accountId: 'wise-usd' }, [dale], rates)).toBeNull();
    expect(matchPlan({ kind: 'income', amount: 5_500, currency: 'USD', postedAt: at('2026-11-30'), accountId: 'gotyme' }, [dale], rates)).toBeNull();
    expect(matchPlan({ kind: 'income', amount: 5_500, currency: 'USD', postedAt: at('2026-11-30'), accountId: null }, [dale], rates)?.id).toBe('dale');
    expect(matchPlan({ kind: 'expense', amount: 169_900, currency: 'PHP', postedAt: at('2026-11-30'), accountId: 'maya' }, [internet], rates)?.id).toBe('net');
  });
  it('skips paused plans and transfers', () => {
    expect(matchPlan({ kind: 'income', amount: 5_500, currency: 'USD', postedAt: at('2026-11-30'), accountId: 'wise-usd' }, [{ ...dale, active: false }], rates)).toBeNull();
    expect(matchPlan({ kind: 'transfer', amount: 5_500, currency: 'USD', postedAt: at('2026-11-30'), accountId: 'wise-usd' }, [dale], rates)).toBeNull();
  });
});

describe('already recorded', () => {
  const txs = [{ id: 't1', type: 'income', amount: 5_500, accountId: 'wise-usd', date: '2026-11-30', deletedAt: null }];
  it('finds the same amount on the same account within a day', () => {
    expect(findRecorded({ type: 'income', amount: 5_500, accountId: 'wise-usd', date: '2026-12-01' }, txs)?.id).toBe('t1');
    expect(findRecorded({ type: 'income', amount: 5_500, accountId: 'wise-usd', date: '2026-12-03' }, txs)).toBeNull();
    expect(findRecorded({ type: 'expense', amount: 5_500, accountId: 'wise-usd', date: '2026-11-30' }, txs)).toBeNull();
    expect(findRecorded({ type: 'income', amount: 5_500, accountId: 'wise-usd', date: '2026-11-30' }, [{ ...txs[0], deletedAt: 1 }])).toBeNull();
  });
});
