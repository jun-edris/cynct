// Safe to spend today, shared by Plan and the Add screen.
import { useMemo } from 'react';
import { useData, safeJson } from './DataContext';
import { forecast, isLiability, summarize, upcoming } from '../lib/ledger';
import { safeToSpend, type SafeToSpend } from '../lib/paycheck';
import { addDays, daysBetween, lastDayOfMonth, todayISO } from '../lib/money';

export function useSafeToSpend(): SafeToSpend & { bills: number } {
  const { data, baseBalances, rtx, cats, plannedBase } = useData();
  return useMemo(() => {
    const today = todayISO();
    // Money in accounts you spend from: not cards, loans, accounts tied to a goal, or ones you switched off.
    const out = new Set([...data.goals.filter(g => !g.archived).flatMap(g => safeJson<string[]>(g.accountIds, [])), ...((data.settings.stsExclude as string[] | undefined) ?? [])]);
    const spendable = data.accounts.filter(a => !a.archived && !isLiability(a.type) && !out.has(a.id)).reduce((x, a) => x + (baseBalances.get(a.id) ?? 0), 0);
    const nextIn = upcoming(plannedBase.recurring, [], today, 60).find(i => i.direction === 'in' && i.date > today) ?? null;
    const until = nextIn?.date ?? addDays(lastDayOfMonth(today), 1);
    const bills = forecast({ accounts: data.accounts, balances: baseBalances, txs: rtx, recurring: plannedBase.recurring,
      installments: plannedBase.installments.filter(i => i.paidCount < i.months), debts: data.debts }, today, Math.max(1, daysBetween(today, until)))
      .items.filter(i => i.direction === 'out' && i.date < until).reduce((x, i) => x + i.amount, 0);
    const s = safeToSpend({ spendable, spentToday: summarize(rtx, today, today, cats).expense, bills, today, next: nextIn ? { date: nextIn.date, name: nextIn.name } : null });
    return { ...s, bills };
  }, [data, baseBalances, rtx, cats, plannedBase]);
}
