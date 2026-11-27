// Money in vs money out for the Home header graph.
import { dailyTotals, summarize, type TxLite } from './ledger';
import { addDays, addMonths, daysBetween, lastDayOfMonth, monthKey } from './money';

export interface MonthFlow { days: string[]; inc: number[]; out: number[]; income: number; expense: number }

/** Running totals of income and spending for each day from the 1st of `today`'s month to today. */
export function monthFlow(txs: TxLite[], today: string): MonthFlow {
  const start = `${monthKey(today)}-01`;
  const per = dailyTotals(txs, start, today);
  const n = daysBetween(start, today) + 1;
  const days: string[] = [], inc: number[] = [], out: number[] = [];
  let i = 0, o = 0;
  for (let k = 0; k < n; k++) {
    const d = addDays(start, k);
    const v = per.get(d);
    if (v) { i += v.income; o += v.expense; }
    days.push(d); inc.push(i); out.push(o);
  }
  return { days, inc, out, income: i, expense: o };
}

export interface MonthTotal { key: string; income: number; expense: number }

/** Income and spending for the last `n` months, oldest first, ending with `today`'s month. */
export function lastMonths(txs: TxLite[], today: string, n = 6): MonthTotal[] {
  const first = addMonths(`${monthKey(today)}-01`, -(n - 1));
  const out: MonthTotal[] = [];
  for (let k = 0; k < n; k++) {
    const s = addMonths(first, k);
    const sum = summarize(txs, s, lastDayOfMonth(s));
    out.push({ key: monthKey(s), income: sum.income, expense: sum.expense });
  }
  return out;
}
