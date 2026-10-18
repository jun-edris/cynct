// What to remind you about, worked out from your data. Pure: the scheduler turns this into phone notifications.
import { debtStatus, nextDayOfMonth, isLiability } from './ledger';
import { addDays, daysBetween, peso } from './money';

export interface ReminderPrefs {
  enabled: boolean;
  time: string; // HH:MM, shared by every reminder
  daily: boolean; // evening check-in to log spending
  bills: boolean; // planned bills, income and installments
  debts: boolean;
  cards: boolean; // credit card due days
  goals: boolean; // goal deadlines
}
export const DEFAULT_PREFS: ReminderPrefs = { enabled: false, time: '20:00', daily: true, bills: true, debts: true, cards: true, goals: true };

export interface Reminder { key: string; date: string; title: string; body: string; url: string }

interface PlanInput {
  recurring: { id: string; name: string; kind: string; amount: number; nextDue: string; active: boolean }[];
  installments: { id: string; name: string; monthlyAmount: number; months: number; paidCount: number; nextDue: string }[];
  debts: { id: string; direction: string; person: string; principal: number; alreadyPaid?: number; dueDate: string | null; closed: boolean }[];
  accounts: { id: string; name: string; type: string; archived: boolean; dueDay: number | null }[];
  balances: Map<string, number>;
  goals: { id: string; name: string; deadline: string; archived: boolean; target: number }[];
  txs: Parameters<typeof debtStatus>[1];
  fmt?: (minor: number, accountId?: string | null) => string;
}

/** Reminders for the next `days` days (date-based; the daily check-in is a separate repeating notification). */
export function planReminders(input: PlanInput, prefs: ReminderPrefs, today: string, days = 30): Reminder[] {
  if (!prefs.enabled) return [];
  const end = addDays(today, days);
  const out: Reminder[] = [];
  const inWindow = (d: string) => d >= today && d <= end;
  const money = (v: number) => peso(v, { cents: false });

  if (prefs.bills) {
    for (const r of input.recurring) {
      if (!r.active || !inWindow(r.nextDue)) continue;
      const income = r.kind === 'income';
      out.push({ key: `rec:${r.id}:${r.nextDue}`, date: r.nextDue, url: `/recurring/${r.id}`,
        title: income ? `${r.name} expected today` : r.kind === 'transfer' ? `${r.name} today` : `${r.name} is due today`,
        body: `${money(r.amount)}. Tap to mark it ${income ? 'received' : 'paid'}.` });
      // A heads-up the day before for bills.
      const before = addDays(r.nextDue, -1);
      if (!income && r.kind !== 'transfer' && inWindow(before)) {
        out.push({ key: `rec-pre:${r.id}:${r.nextDue}`, date: before, url: `/recurring/${r.id}`, title: `${r.name} is due tomorrow`, body: `${money(r.amount)}. Make sure the money’s there.` });
      }
    }
    for (const i of input.installments) {
      if (i.paidCount >= i.months || !inWindow(i.nextDue)) continue;
      out.push({ key: `inst:${i.id}:${i.nextDue}`, date: i.nextDue, url: `/installment/${i.id}`,
        title: `${i.name} payment due`, body: `${money(i.monthlyAmount)} · payment ${i.paidCount + 1} of ${i.months}.` });
    }
  }

  if (prefs.debts) {
    for (const d of input.debts) {
      if (d.closed || !d.dueDate) continue;
      const s = debtStatus(d, input.txs);
      if (!s.remaining) continue;
      for (const [offset, label] of [[-3, 'in 3 days'], [0, 'today']] as const) {
        const date = addDays(d.dueDate, offset);
        if (!inWindow(date)) continue;
        out.push({ key: `debt:${d.id}:${offset}`, date, url: `/debt/${d.id}`,
          title: d.direction === 'owe' ? `Payment to ${d.person} due ${label}` : `${d.person} should pay you back ${label}`,
          body: `${money(s.remaining)} left.` });
      }
    }
  }

  if (prefs.cards) {
    for (const a of input.accounts) {
      if (a.archived || !isLiability(a.type) || !a.dueDay) continue;
      const owed = Math.max(0, -(input.balances.get(a.id) ?? 0));
      if (!owed) continue;
      const due = nextDayOfMonth(a.dueDay, today);
      for (const [offset, label] of [[-2, 'in 2 days'], [0, 'today']] as const) {
        const date = addDays(due, offset);
        if (!inWindow(date)) continue;
        out.push({ key: `card:${a.id}:${offset}`, date, url: `/account/${a.id}`, title: `${a.name} payment due ${label}`,
          body: `${input.fmt ? input.fmt(owed, a.id) : money(owed)} on the card. Pay in full to avoid interest.` });
      }
    }
  }

  if (prefs.goals) {
    for (const g of input.goals) {
      if (g.archived) continue;
      const left = daysBetween(today, g.deadline);
      for (const [offset, label] of [[-7, 'a week away'], [0, 'today']] as const) {
        const date = addDays(g.deadline, offset);
        if (left < 0 || !inWindow(date)) continue;
        out.push({ key: `goal:${g.id}:${offset}`, date, url: `/goal/${g.id}`, title: `${g.name}: target date ${label}`, body: 'See how close you are.' });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}
