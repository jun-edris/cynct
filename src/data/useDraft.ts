// Shared logic for one captured payment (a draft): what it resolves to, duplicates, plan matches,
// and the add / settle / dismiss / edit actions. Used by the review list and the swipe deck.
import { router } from 'expo-router';
import { useData } from '../data/DataContext';
import { formatTime } from '../components/ui';
import { payRecurring, setCaptured, setSetting } from '../db/repo';
import { findRecorded, matchPlan } from '../lib/match';
import { APPS, type Draft } from '../lib/capture';
import { addDraft, resolveDraft, type CapturePrefs } from './capture';
import { convert } from '../lib/currency';
import { budgetCrossings, crossingText } from '../lib/budgetAlert';
import { learn, type CatMemory } from '../lib/learn';
import { dayLabel, todayISO } from '../lib/money';

export const appName = (id: string | null) => APPS.find(a => a.id === id)?.name ?? id ?? 'another account';
export const when = (ms: number) => { const d = new Date(ms); return `${dayLabel(todayISO(d))} · ${formatTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)}`; };

export function useDraft(d: Draft, prefs: CapturePrefs) {
  const { data, act, rates, cats, curOf, fmt, rtx } = useData();
  const r = resolveDraft(d, prefs, data.accounts, cats, rates, data.settings.catMemory as CatMemory | undefined);
  // Already in Cynct (e.g. Received was tapped first)? Or does it settle a planned payment?
  const dup = r.tx ? findRecorded(r.tx, data.transactions) : null;
  const planRow = (() => {
    if (dup || !r.tx) return null;
    const plans = data.recurring.map(x => ({ ...x, currency: curOf(x.accountId) }));
    const m = matchPlan({ kind: d.kind, amount: d.amount, currency: d.currency, postedAt: d.postedAt, accountId: r.accountId }, plans, rates);
    return m ? data.recurring.find(x => x.id === m.id) ?? null : null;
  })();
  const settle = () => {
    if (!planRow || !r.tx) return;
    const debt = planRow.debtId ? data.debts.find(x => x.id === planRow.debtId) ?? null : null;
    act(db => { const t = payRecurring(db, planRow, r.tx!.date, r.tx!.amount, debt); setCaptured(db, d.ids, 'added', t.id); },
      `${planRow.name}: ${fmt(r.tx.amount, planRow.accountId)} ${planRow.kind === 'income' ? 'received' : 'paid'}`);
  };
  const acc = (id: string | null) => data.accounts.find(a => a.id === id)?.name ?? null;
  const where = d.kind === 'transfer' ? `${acc(r.fromId) ?? appName(d.fromApp)} → ${acc(r.toId) ?? appName(d.toApp)}` : acc(r.accountId) ?? appName(d.app);
  const cat = r.categoryId ? data.categories.find(x => x.id === r.categoryId)?.name : null;
  const date = todayISO(new Date(d.postedAt));
  const time = (() => { const t = new Date(d.postedAt); return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; })();

  const edit = (asTransfer = false) => {
    const ids = d.ids.join(',');
    if (d.kind === 'transfer' || asTransfer) {
      const fromId = asTransfer ? null : r.fromId, toId = asTransfer ? r.accountId : r.toId;
      const fromCur = data.accounts.find(a => a.id === fromId)?.currency;
      const toCur = data.accounts.find(a => a.id === toId)?.currency;
      router.push({ pathname: '/transfer/[id]', params: { id: 'new', from: fromId ?? '', to: toId ?? '', note: d.note, date, time, capture: ids,
        amount: !fromId || fromCur === d.currency ? String(d.amount / 100) : '', received: toCur === d.currency && fromCur && fromCur !== toCur ? String(d.amount / 100) : '' } });
      return;
    }
    router.push({ pathname: '/tx/[id]', params: { id: 'new', type: d.kind, amount: String(d.amount / 100), currency: d.currency, note: d.note, date, time,
      account: r.accountId ?? '', category: r.categoryId ?? '', capture: ids } });
  };


  /** Adds it as a new entry, optionally under another category (which is then remembered for this payee). */
  const add = (categoryId?: string | null) => {
    if (!r.tx) return false;
    const tx = categoryId !== undefined ? { ...r.tx, categoryId } : r.tx;
    const crossed = tx.type === 'expense' ? budgetCrossings(data.budgets, rtx, cats, { categoryId: tx.categoryId, amount: convert(tx.amount, curOf(tx.accountId), 'PHP', rates) ?? tx.amount, date: tx.date }, todayISO())[0] : undefined;
    const mem = data.settings.catMemory as CatMemory | undefined;
    const learned = categoryId !== undefined && categoryId !== r.tx.categoryId ? learn(mem, d.who ?? d.note, categoryId) : mem;
    return act(db => { addDraft(db, d, tx); if (learned && learned !== mem) setSetting(db, 'catMemory', learned); },
      crossed ? crossingText(crossed, v => fmt(v, null)) : `${d.kind === 'transfer' ? 'Transfer' : d.kind === 'income' ? 'Income' : 'Expense'} added`);
  };
  const dismiss = () => act(db => setCaptured(db, d.ids, 'dismissed'), 'Dismissed');
  return { r, dup, planRow, settle, add, dismiss, edit, where, cat, date, time, data, act };
}
