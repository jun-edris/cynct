import { useCallback } from 'react';
import { useData } from './DataContext';
import { router } from 'expo-router';
import { newTx, payInstallment, setRate, setSetting, softDelete, undoInstallmentPayment, upsert } from '../db/repo';
import { fetchLiveRates } from '../lib/fxrates';
import { todayISO } from '../lib/money';
import { BASE, money } from '../lib/currency';
import type { UpcomingItem } from '../lib/ledger';

/** Marks a planned payment or installment as done today, with undo. */
export function usePayUpcoming() {
  const { data, act } = useData();
  return useCallback((item: Pick<UpcomingItem, 'source' | 'id'>) => {
    if (item.source === 'recurring') {
      // Ask for the real amount and date first; bills and pay often differ from the plan.
      if (data.recurring.some(x => x.id === item.id)) router.push({ pathname: '/pay-planned', params: { id: item.id } });
    } else if (item.source === 'installment') {
      const i = data.installments.find(x => x.id === item.id);
      if (!i) return;
      let txId = '';
      act(db => { txId = payInstallment(db, i, todayISO()).id; }, `${i.name}: payment ${i.paidCount + 1} of ${i.months} recorded`,
        { label: 'Undo', run: () => act(db => undoInstallmentPayment(db, i, txId)) });
    }
  }, [data, act]);
}

/** Only the next occurrence of a planned payment can be marked done; later ones are previews. */
export function isPayable(item: UpcomingItem, data: ReturnType<typeof useData>['data']): boolean {
  if (item.source === 'recurring') return data.recurring.find(r => r.id === item.id)?.nextDue === item.date;
  if (item.source === 'installment') return data.installments.find(i => i.id === item.id)?.nextDue === item.date;
  return false;
}

/**
 * Uses a saved template: with an amount it records the entry today (with undo);
 * without one it opens the entry screen prefilled so you can type the amount.
 */
export function useApplyTemplate() {
  const { data, act } = useData();
  return useCallback((id: string) => {
    const tpl = data.templates.find(x => x.id === id);
    if (!tpl) return;
    const accountId = tpl.accountId && data.accounts.some(a => a.id === tpl.accountId && !a.archived) ? tpl.accountId : null;
    if (tpl.type === 'transfer') { router.push({ pathname: '/transfer/[id]', params: { id: 'new' } }); return; }
    if (!tpl.amount || !accountId) {
      router.push({ pathname: '/tx/[id]', params: { id: 'new', type: tpl.type, note: tpl.note, category: tpl.categoryId ?? '', account: accountId ?? '', amount: tpl.amount ? String(tpl.amount / 100) : '' } });
      return;
    }
    const trip = data.trips.find(t => !t.endDate);
    const tx = newTx({ type: tpl.type, amount: tpl.amount, accountId, categoryId: tpl.categoryId, date: todayISO(), note: tpl.note, tags: tpl.tags, tripId: trip?.id ?? null });
    act(db => upsert.transaction(db, tx), `${tpl.name}: ${money(tpl.amount, data.accounts.find(a => a.id === accountId)?.currency)} recorded`, { label: 'Undo', run: () => act(db => softDelete(db, [tx.id])) });
  }, [data, act]);
}

export interface FxCache { source: string; at: number; fetchedAt: number; perUnit: Record<string, number> }

/**
 * Pulls live rates and saves them: the full table goes into settings (for the converter), and the
 * currencies you actually use are written to the rates table — except ones you've pinned by hand.
 */
export function useRefreshRates() {
  const { db, data, reload } = useData();
  return useCallback(async (): Promise<FxCache> => {
    const live = await fetchLiveRates();
    const pinned = new Set((data.settings.pinnedRates as string[] | undefined) ?? []);
    const want = new Set([...data.accounts.filter(a => !a.archived).map(a => a.currency), ...data.rates.map(r => r.currency)]);
    const cache: FxCache = { source: live.source, at: live.at, fetchedAt: Date.now(), perUnit: live.perUnit };
    db.transaction(tx => {
      const d = tx as unknown as typeof db;
      for (const code of want) if (code !== BASE && !pinned.has(code) && live.perUnit[code]) setRate(d, code, live.perUnit[code]);
      setSetting(d, 'fx', cache);
    });
    reload();
    return cache;
  }, [db, data, reload]);
}
