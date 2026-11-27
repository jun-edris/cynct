// Needs, wants and savings: classifies spending and compares a pay's plan with a target split
// such as 50/30/20. Pure functions; amounts in pesos (centavos).
import { addDays } from './money';
import type { CategoryLite, TxLite } from './ledger';

export type Bucket = 'need' | 'want' | 'save';

// Your own categories, matched from the most specific id up. Anything unknown counts as a want.
const BUCKETS: Record<string, Bucket> = {
  food: 'need', 'food.groceries': 'need', 'food.eatout': 'want', 'food.coffee': 'want',
  transport: 'need', phone: 'need', bills: 'need', health: 'need', family: 'need', fees: 'need',
  subs: 'want', shopping: 'want', wants: 'want', other: 'want',
  house: 'save', // building the house is putting money into something you'll own
};

export function bucketOf(catId: string | null, cats: CategoryLite[]): Bucket {
  let id = catId;
  for (let guard = 0; id && guard < 6; guard++) {
    if (BUCKETS[id]) return BUCKETS[id];
    id = cats.find(c => c.id === id)?.parentId ?? null;
  }
  return 'want';
}

/** Share of everyday spending (not planned bills) that went to needs over the last `window` days. 0.6 if there's no history. */
export function needsShareOf(txs: (TxLite & { recurringId?: string | null; installmentId?: string | null })[], cats: CategoryLite[], today: string, window = 60): number {
  const from = addDays(today, -window);
  let need = 0, all = 0;
  for (const t of txs) {
    if (t.deletedAt || t.type !== 'expense' || t.date <= from || t.date > today || t.recurringId || t.installmentId || t.debtId) continue;
    const b = bucketOf(t.categoryId, cats);
    if (b === 'save') continue;
    all += t.amount;
    if (b === 'need') need += t.amount;
  }
  return all > 0 ? need / all : 0.6;
}

export interface Split { needs: number; wants: number; savings: number }

/** Turns a paycheck plan into needs / wants / savings. Day-to-day is split by how you've actually been spending. */
export function splitOfPlan(p: { needs: number; dayToDay: number; save: number; invest: number; free: number }, needsShare: number): Split {
  const dayNeeds = Math.round(p.dayToDay * Math.min(1, Math.max(0, needsShare)));
  return { needs: p.needs + dayNeeds, wants: p.dayToDay - dayNeeds + p.free, savings: p.save + p.invest };
}

export const SPLITS: { key: string; label: string; target: [number, number, number]; hint: string }[] = [
  { key: '50-30-20', label: '50 / 30 / 20', target: [50, 30, 20], hint: 'The classic: half on needs, a third on wants, a fifth saved.' },
  { key: '50-20-30', label: '50 / 20 / 30', target: [50, 20, 30], hint: 'Saving harder for a big goal, like a house.' },
  { key: '60-20-20', label: '60 / 20 / 20', target: [60, 20, 20], hint: 'When bills and family take more than half.' },
  { key: '40-20-40', label: '40 / 20 / 40', target: [40, 20, 40], hint: 'Low costs (e.g. living at home): save a lot while you can.' },
];

/** The target split in pesos for a pay, with the last bucket taking the rounding. */
export function targetAmounts(pay: number, target: [number, number, number]): Split {
  const needs = Math.round(pay * target[0] / 100), wants = Math.round(pay * target[1] / 100);
  return { needs, wants, savings: Math.max(0, pay - needs - wants) };
}
