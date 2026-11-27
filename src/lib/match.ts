// Ties captured payments to what Cynct already knows, so nothing is recorded twice:
// a planned payment it settles ("that's Dale's weekly $55"), or an entry that's already there.
import { convert, type RateMap } from './currency';
import { daysBetween, todayISO } from './money';

export interface PlanLite {
  id: string; name: string; kind: string; amount: number; accountId: string; nextDue: string; active: boolean;
  currency: string; // the plan's account currency; amount is in it
}
export interface CaughtLite {
  kind: 'expense' | 'income' | 'transfer';
  amount: number; currency: string; postedAt: number;
  accountId: string | null; // the account the payment resolved to, if any
}

const dayOf = (ms: number) => todayISO(new Date(ms));

/**
 * The planned payment a captured one most likely settles: same direction, same account (or currency when
 * no account is linked yet), due within `days` of the payment, and an amount within `pct` (fees and rates
 * move it a little). Closest due date wins, then closest amount. Null when nothing fits.
 */
export function matchPlan(c: CaughtLite, plans: PlanLite[], rates: RateMap, days = 3, pct = 0.05): PlanLite | null {
  if (c.kind === 'transfer') return null;
  const want = c.kind === 'income' ? 'income' : 'bill';
  const day = dayOf(c.postedAt);
  let best: { p: PlanLite; gap: number; diff: number } | null = null;
  for (const p of plans) {
    if (!p.active || p.kind !== want || !(p.amount > 0)) continue;
    if (c.accountId ? p.accountId !== c.accountId : p.currency !== c.currency) continue;
    const gap = Math.abs(daysBetween(day, p.nextDue));
    if (gap > days) continue;
    const amt = convert(c.amount, c.currency, p.currency, rates);
    if (amt == null) continue;
    const diff = Math.abs(amt - p.amount);
    if (diff > Math.max(p.amount * pct, 100)) continue;
    if (!best || gap < best.gap || (gap === best.gap && diff < best.diff)) best = { p, gap, diff };
  }
  return best?.p ?? null;
}

export interface TxLiteForDup { id: string; type: string; amount: number; accountId: string | null; date: string; deletedAt?: number | null }

/**
 * An entry already in Cynct that looks like this one: same account and type, the same amount
 * (to the centavo), within a day. Catches "I tapped Received, then the notification came in".
 */
export function findRecorded<T extends TxLiteForDup>(t: { type: string; amount: number; accountId: string | null; date: string }, txs: T[]): T | null {
  for (const x of txs) {
    if (x.deletedAt || x.type !== t.type || x.accountId !== t.accountId) continue;
    if (Math.abs(x.amount - t.amount) > 1) continue;
    if (Math.abs(daysBetween(x.date, t.date)) > 1) continue;
    return x;
  }
  return null;
}
