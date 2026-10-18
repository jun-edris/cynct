// "Wrapped"-style recap and monthly statements: plain summaries of a date range, in pesos.
import { FEES_CATEGORY, rootOf, summarize, type CategoryLite, type TxLite } from './ledger';
import { addDays, daysBetween } from './money';

export interface Recap {
  start: string; end: string; days: number;
  income: number; expense: number; net: number; savingsRate: number | null;
  entries: number; daysLogged: number; bestStreak: number; avgPerDay: number;
  top: { id: string; amount: number; share: number }[];
  biggest: { id: string; amount: number; note: string; date: string; categoryId: string | null } | null;
  busiest: { date: string; amount: number } | null;
  personality: { title: string; blurb: string; icon: string };
}

export function buildRecap(txs: TxLite[], cats: CategoryLite[], start: string, end: string): Recap {
  const live = txs.filter(t => !t.deletedAt && t.date >= start && t.date <= end);
  const s = summarize(live, start, end, cats);
  const days = daysBetween(start, end) + 1;
  const logged = [...new Set(live.map(t => t.date))].sort();
  let best = 0, run = 0, prev: string | null = null;
  for (const d of logged) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  const top = [...s.byRoot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, amount]) => ({ id, amount, share: s.expense ? amount / s.expense : 0 }));
  const expenses = live.filter(t => t.type === 'expense');
  const big = expenses.reduce<TxLite | null>((m, t) => (!m || t.amount > m.amount ? t : m), null);
  const perDay = new Map<string, number>();
  for (const t of expenses) perDay.set(t.date, (perDay.get(t.date) ?? 0) + t.amount);
  const busiest = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];
  const savingsRate = s.income > 0 ? (s.income - s.expense) / s.income : null;
  return {
    start, end, days, income: s.income, expense: s.expense, net: s.net, savingsRate,
    entries: live.length, daysLogged: logged.length, bestStreak: best, avgPerDay: Math.round(s.expense / days),
    top, biggest: big ? { id: big.id, amount: big.amount, note: big.note ?? '', date: big.date, categoryId: big.categoryId } : null,
    busiest: busiest ? { date: busiest[0], amount: busiest[1] } : null,
    personality: personality({ income: s.income, expense: s.expense, savingsRate, topShare: top[0]?.share ?? 0, entries: live.length, daysLogged: logged.length, days, topId: top[0]?.id }),
  };
}

function personality(x: { income: number; expense: number; savingsRate: number | null; topShare: number; entries: number; daysLogged: number; days: number; topId?: string }) {
  if (x.entries < 5) return { title: 'The Fresh Start', icon: 'sprout', blurb: 'Not much logged yet. A few weeks of entries and this gets interesting.' };
  if (x.income > 0 && x.expense > x.income) return { title: 'The Stretcher', icon: 'arrow-expand-horizontal', blurb: 'You spent more than came in. One or two categories usually explain most of it; start there.' };
  if (x.savingsRate !== null && x.savingsRate >= 0.3) return { title: 'The Builder', icon: 'home-city-outline', blurb: `You kept ${Math.round(x.savingsRate * 100)}% of what you earned. That’s the habit that gets big goals done.` };
  if (x.topShare >= 0.4 && x.topId !== FEES_CATEGORY) return { title: 'The Specialist', icon: 'target', blurb: 'One category took a big slice of your spending. If that’s on purpose, nice; if not, it’s the easiest place to trim.' };
  if (x.daysLogged / x.days >= 0.8) return { title: 'The Tracker', icon: 'radar', blurb: 'You logged almost every day. Your numbers are the real thing, not guesses.' };
  return { title: 'The Balancer', icon: 'scale-balance', blurb: 'Spending spread across the board with room left over. Steady.' };
}

export const rootName = (id: string, cats: { id: string; name: string; parentId: string | null; kind: string }[]) =>
  id === 'uncategorized' ? 'Uncategorized' : cats.find(c => c.id === (rootOf(id, cats) ?? id))?.name ?? 'Other';
