// Paycheck plan: splits one pay into what's already spoken for (bills due before the next payday),
// day-to-day spending, goals, investing, and what's truly free. Pure functions, unit tested.
// All amounts are in pesos (base currency) as integer centavos.
import { addDays, daysBetween } from './money';

export interface PlanBill { key: string; name: string; date: string; amount: number; source: string }
export interface PlanGoal { id: string; name: string; need: number; room?: number; monthly?: number } // room: left to reach the target
export interface PaycheckInput {
  amount: number;
  days: number; // days this pay has to last (pay date up to, not including, the next payday)
  bills: PlanBill[];
  dailySpend: number; // typical day-to-day spending per day
  goals: PlanGoal[];
  investPct: number; // 0–100, share of the pay to invest
  freeToGoals?: boolean; // put whatever is left at the end into goals too
  priorityId?: string | null; // e.g. the emergency fund: filled to its need (and topped up first) before the others
}
export interface PaycheckPlan {
  needs: number; dayToDay: number; save: number; invest: number; free: number;
  shortfall: number; // how much the plan is over the pay, after trimming investing and goals
  goals: (PlanGoal & { put: number })[];
  wanted: { needs: number; dayToDay: number; save: number; invest: number };
  share: (v: number) => number;
}

/**
 * Fills buckets in order of what can't wait: bills, then day-to-day, then goals, then investing.
 * When the pay runs out, later buckets shrink first; bills are never trimmed (the shortfall is reported instead).
 */
export function planPaycheck(p: PaycheckInput): PaycheckPlan {
  const amount = Math.max(0, Math.round(p.amount));
  const needs = p.bills.reduce((s, b) => s + b.amount, 0);
  const wantDay = Math.max(0, Math.round(p.dailySpend * Math.max(0, p.days)));
  const wantSave = p.goals.reduce((s, g) => s + Math.max(0, g.need), 0);
  const wantInvest = Math.round(amount * Math.min(100, Math.max(0, p.investPct)) / 100);

  let left = amount - needs;
  const dayToDay = Math.max(0, Math.min(wantDay, left));
  left -= dayToDay;
  const save = Math.max(0, Math.min(wantSave, left));
  left -= save;
  const invest = Math.max(0, Math.min(wantInvest, left));
  left -= invest;
  // Optional: nothing stays free, the rest tops up the goals.
  const room = p.goals.reduce((s, g) => s + (g.room ?? Infinity), 0);
  const extra = p.freeToGoals && wantSave > 0 ? Math.max(0, Math.min(left, room - save)) : 0;
  left -= extra;
  const saved = save + extra;

  const goals = p.goals.map(g => ({ ...g, put: 0 }));
  const first = p.priorityId ? goals.find(g => g.id === p.priorityId) ?? null : null;
  const others = goals.filter(g => g !== first);
  // Spread `amt` over goals in proportion to what each needs; the last one takes the rounding.
  const spread = (list: typeof goals, amt: number) => {
    const want = list.reduce((x, g) => x + Math.max(0, g.need), 0);
    if (amt <= 0 || !list.length) return amt;
    if (want <= 0) return amt;
    let given = 0;
    list.forEach((g, i) => {
      const part = i === list.length - 1 ? amt - given : Math.floor(amt * Math.max(0, g.need) / want);
      g.put += part; given += part;
    });
    return 0;
  };
  if (saved > 0 && wantSave > 0) {
    let rest = save;
    // Priority goal: its full need comes out of the goal money first.
    if (first) { const t = Math.min(rest, Math.max(0, first.need)); first.put += t; rest -= t; }
    rest = spread(others, rest);
    if (first) { first.put += rest; rest = 0; } // nothing else needed it
    let more = extra;
    // Extra money tops up the priority goal first, up to what it still lacks.
    if (first) { const t = Math.min(more, Math.max(0, (first.room ?? Infinity) - first.put)); first.put += t; more -= t; }
    more = spread(others.length ? others : goals, more);
    if (more > 0 && first) first.put += more;
    // A goal can't take more than it still needs; pass any overflow to goals that still have room.
    let over = 0;
    for (const g of goals) if (g.room !== undefined && g.put > g.room) { over += g.put - g.room; g.put = g.room; }
    for (const g of [...(first ? [first] : []), ...others]) {
      if (over <= 0) break;
      const take = Math.min(over, (g.room ?? Infinity) - g.put);
      if (take > 0) { g.put += take; over -= take; }
    }
  }
  const shortfall = Math.max(0, needs + wantDay - amount);
  return {
    needs, dayToDay, save: saved, invest, free: Math.max(0, left), shortfall, goals,
    wanted: { needs, dayToDay: wantDay, save: wantSave, invest: wantInvest },
    share: (v: number) => (amount > 0 ? v / amount : 0),
  };
}

/** The next expected income after the pay date, from planned income (salary first). Null if none is planned. */
export function nextPayday(
  incoming: { date: string; categoryId?: string | null }[], payDate: string, salaryIds: Set<string>,
): string | null {
  const after = incoming.filter(i => i.date > payDate).sort((a, b) => a.date.localeCompare(b.date));
  return (after.find(i => i.categoryId && salaryIds.has(i.categoryId)) ?? after[0])?.date ?? null;
}

type SpendTx = { type: string; amount: number; date: string; deletedAt?: number | null; recurringId?: string | null; installmentId?: string | null; debtId?: string | null; categoryId?: string | null };

export interface DailyDetail { daily: number; days: number; oneOffs: number; oneOffTotal: number; /** share of day-to-day that was needs (1 if unknown) */ needShare: number }

/**
 * Typical everyday spending per day over the last `window` days: expenses that aren't planned
 * payments, installments or debt payments (those are already counted as bills).
 * - Short history: divides by the days you've actually been tracking (at least 14), not the full window.
 * - One-offs: a single spend over 5× your typical spend that is also over 15% of the window's total
 *   (a phone, a plane ticket) is left out, so one big buy doesn't inflate every future day.
 */
export function dailySpendingDetail(txs: SpendTx[], today: string, window = 60, isWant?: (categoryId: string | null) => boolean): DailyDetail {
  const from = addDays(today, -window);
  let first: string | null = null;
  const spends: number[] = [];
  const wantFlags: boolean[] = [];
  for (const t of txs) {
    if (t.deletedAt || t.date > today) continue;
    if (first === null || t.date < first) first = t.date;
    if (t.type !== 'expense' || t.date <= from) continue;
    if (t.recurringId || t.installmentId || t.debtId) continue;
    spends.push(t.amount);
    wantFlags.push(isWant ? isWant(t.categoryId ?? null) : false);
  }
  if (first === null || spends.length === 0) return { daily: 0, days: 0, oneOffs: 0, oneOffTotal: 0, needShare: 1 };
  const tracked = daysBetween(first, today) + 1;
  const days = Math.min(window, Math.max(14, tracked));
  const total = spends.reduce((a, b) => a + b, 0);
  const sorted = [...spends].sort((a, b) => a - b);
  const median = sorted[Math.floor((sorted.length - 1) / 2)];
  let oneOffs = 0, oneOffTotal = 0, wantTotal = 0;
  spends.forEach((v, i) => {
    if (spends.length >= 5 && v > median * 5 && v > total * 0.15) { oneOffs++; oneOffTotal += v; return; }
    if (wantFlags[i]) wantTotal += v;
  });
  const kept = total - oneOffTotal;
  return { daily: Math.round(kept / days), days, oneOffs, oneOffTotal, needShare: kept > 0 ? 1 - wantTotal / kept : 1 };
}

export function dailySpending(txs: SpendTx[], today: string, window = 60): number {
  return dailySpendingDetail(txs, today, window).daily;
}

/**
 * What a goal should get from one pay: the monthly amount you set on the goal (or what its deadline needs
 * when you haven't set one), times this pay's share of the month.
 * `payShare` is this pay ÷ your planned monthly income, so a pay that is two-thirds of your month carries
 * two-thirds of the goal's month. Without planned income, it falls back to the pay's length in days.
 * Never more than what's left to save.
 */
export function goalShare(monthly: number, needed: number, left: number, days: number, payShare: number | null = null): number {
  if (left <= 0) return 0;
  const perMonth = monthly > 0 ? monthly : needed;
  const part = payShare !== null ? Math.min(1, Math.max(0, payShare)) : days / 30.44;
  return Math.min(left, Math.round(perMonth * part));
}

/** This pay as a share of planned monthly income, or null if no income is planned. Capped at one month. */
export function payShareOf(pay: number, monthlyIncome: number): number | null {
  if (monthlyIncome <= 0 || pay <= 0) return null;
  return Math.min(1, pay / Math.max(monthlyIncome, pay));
}

export const payDays = (payDate: string, next: string) => Math.max(1, daysBetween(payDate, next));

// ---------- needs / wants / savings guide ----------
export type GuideKey = '50/30/20' | '60/20/20' | '70/20/10';
export const GUIDES: Record<GuideKey, { needs: number; wants: number; save: number }> = {
  '50/30/20': { needs: 0.5, wants: 0.3, save: 0.2 },
  '60/20/20': { needs: 0.6, wants: 0.2, save: 0.2 },
  '70/20/10': { needs: 0.7, wants: 0.2, save: 0.1 },
};

export interface GuideSplit {
  actual: { needs: number; wants: number; save: number };
  guide: { needs: number; wants: number; save: number };
  /** Plain-language read on the biggest gap, or null when the plan is within 5 points of the guide. */
  note: string | null;
}

/**
 * Compares a plan with a needs / wants / savings rule. Needs = bills + the needs part of day-to-day,
 * wants = free to spend + the wants part of day-to-day, savings = goals + investing. Amounts are centavos; the plan already sums to the pay (or less, if short).
 */
export function guideSplit(plan: Pick<PaycheckPlan, 'needs' | 'dayToDay' | 'save' | 'invest' | 'free'>, amount: number, key: GuideKey, dayNeedShare = 1): GuideSplit {
  const g = GUIDES[key];
  const dayNeeds = Math.round(plan.dayToDay * Math.min(1, Math.max(0, dayNeedShare)));
  const actual = { needs: plan.needs + dayNeeds, wants: plan.free + plan.dayToDay - dayNeeds, save: plan.save + plan.invest };
  const guide = { needs: Math.round(amount * g.needs), wants: Math.round(amount * g.wants), save: Math.round(amount * g.save) };
  const share = (v: number) => (amount > 0 ? v / amount : 0);
  const gap = (['needs', 'wants', 'save'] as const)
    .map(k => ({ k, d: Math.round((share(actual[k]) - g[k]) * 1000) / 1000 }))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
  let note: string | null = null;
  if (amount > 0 && Math.abs(gap.d) >= 0.05) {
    const pts = Math.round(Math.abs(gap.d) * 100);
    note = gap.k === 'needs'
      ? gap.d > 0 ? `Needs take ${pts} points more than the guide. Bills and day-to-day are where to look first.` : `Needs are ${pts} points under the guide, so there’s room to save more.`
      : gap.k === 'save'
        ? gap.d < 0 ? `Saving is ${pts} points under the guide. Turning on “Put what’s free into goals” or raising investing closes it.` : `Saving is ${pts} points over the guide. Nice.`
        : gap.d > 0 ? `${pts} points more free money than the guide. Some of it could go to goals.` : `Free money is ${pts} points under the guide. Tight, but fine if goals are the priority.`;
  }
  return { actual, guide, note };
}

// ---------- need or want ----------
export type NeedWant = 'need' | 'want';
/** Starting point for the built-in categories; anything else is a need until you say otherwise. Children inherit. */
export const DEFAULT_WANTS = new Set(['food.eatout', 'food.coffee', 'subs', 'shopping', 'wants']);

/** Is spending in this category a need or a want? Your own choice wins, then the defaults, walking up to the parent. */
export function needOrWant(catId: string | null, cats: { id: string; parentId: string | null }[], mine: Record<string, NeedWant> = {}): NeedWant {
  let id = catId, guard = 0;
  while (id && guard++ < 10) {
    if (mine[id]) return mine[id];
    if (DEFAULT_WANTS.has(id)) return 'want';
    id = cats.find(c => c.id === id)?.parentId ?? null;
  }
  return 'need';
}

// ---------- safe to spend ----------
export interface SafeToSpend { allowance: number; left: number; days: number; until: string; untilName: string | null }

/**
 * What you can spend per day until money next comes in, and what's left of it today.
 * Spendable money (start of today) minus bills due before then, spread over the days until then.
 * `spendable` is your current balance in accounts you spend from; today's spending is added back so it isn't counted twice.
 */
export function safeToSpend(p: { spendable: number; spentToday: number; bills: number; today: string; next: { date: string; name: string } | null }): SafeToSpend {
  const until = p.next && p.next.date > p.today ? p.next.date : addDays(lastDayOfMonthISO(p.today), 1);
  const days = Math.max(1, daysBetween(p.today, until));
  const pool = Math.max(0, p.spendable + p.spentToday - p.bills);
  const allowance = Math.floor(pool / days);
  return { allowance, left: allowance - p.spentToday, days, until, untilName: p.next && p.next.date > p.today ? p.next.name : null };
}

function lastDayOfMonthISO(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${iso.slice(0, 8)}${String(last).padStart(2, '0')}`;
}
