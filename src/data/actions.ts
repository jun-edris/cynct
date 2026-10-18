import { useCallback } from 'react';
import { useData } from './DataContext';
import { payInstallment, payRecurring, undoInstallmentPayment, undoRecurringPayment } from '../db/repo';
import { peso, todayISO } from '../lib/money';
import type { UpcomingItem } from '../lib/ledger';

/** Marks a planned payment or installment as done today, with undo. */
export function usePayUpcoming() {
  const { data, act } = useData();
  return useCallback((item: Pick<UpcomingItem, 'source' | 'id'>) => {
    if (item.source === 'recurring') {
      const r = data.recurring.find(x => x.id === item.id);
      if (!r) return;
      const debt = r.debtId ? data.debts.find(d => d.id === r.debtId) ?? null : null;
      let txId = '';
      act(db => { txId = payRecurring(db, r, todayISO(), r.amount, debt).id; }, `${r.name}: ${peso(r.amount)} recorded`,
        { label: 'Undo', run: () => act(db => undoRecurringPayment(db, r, txId)) });
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
