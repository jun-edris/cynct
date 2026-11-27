import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { freezeBaseAmounts, loadAll, type AllData, type DB } from '../db/repo';
import { accountBalances, goalFund } from '../lib/ledger';
import type { ParseCategory } from '../lib/parse';
import type { Account, Category, Transaction } from '../db/schema';
import { setMasked } from '../lib/money';
import { BASE, inBase, missingRates, money, snapshotBase, toBase, type RateMap } from '../lib/currency';
import { haptic } from '../components/motion';

export interface ToastAction { label: string; run: () => void }
export interface ToastState { id: number; message: string; action?: ToastAction }

interface Ctx {
  db: DB;
  data: AllData;
  /** Each account's balance in its own currency. */
  balances: Map<string, number>;
  /** Each account's balance in pesos (0 for a currency with no rate yet). */
  baseBalances: Map<string, number>;
  /** Live transactions with amounts in pesos — use for anything that adds up across accounts. */
  rtx: Transaction[];
  rates: RateMap;
  /** Foreign currencies used by an account but missing a rate. */
  missing: string[];
  /** Currency of an account (PHP when unknown). */
  curOf: (accountId: string | null | undefined) => string;
  /** Formats an amount in the given account's currency. */
  fmt: (minor: number, accountId: string | null | undefined, opts?: { sign?: boolean; cents?: boolean | 'auto' }) => string;
  /** Money moved inside goals (goal deposits). Not in any account balance. */
  goalFunds: number;
  /** Positive balances of accounts linked to goals. Already counted in those accounts. */
  goalLinked: number;
  /** Planned payments and installments with amounts in pesos, for timelines and forecasts. */
  plannedBase: { recurring: AllData['recurring']; installments: AllData['installments'] };
  parseCats: ParseCategory[];
  cats: Category[];
  catById: Map<string, Category>;
  accById: Map<string, Account>;
  reload: () => void;
  /** Run a write, reload, and report errors as a toast. Returns false if it failed. */
  act: (fn: (db: DB) => void, success?: string, undo?: ToastAction) => boolean;
  toast: (message: string, action?: ToastAction) => void;
  toastState: ToastState | null;
  dismissToast: () => void;
}

const DataCtx = createContext<Ctx | null>(null);

export function DataProvider({ db, children }: { db: DB; children: React.ReactNode }) {
  const [data, setData] = useState<AllData>(() => loadAll(db));
  const [toastState, setToast] = useState<ToastState | null>(null);
  const counter = useRef(0);

  const reload = useCallback(() => setData(loadAll(db)), [db]);
  const toast = useCallback((message: string, action?: ToastAction) => setToast({ id: ++counter.current, message, action }), []);
  const dismissToast = useCallback(() => setToast(null), []);

  const act = useCallback((fn: (db: DB) => void, success?: string, undo?: ToastAction) => {
    try {
      fn(db);
      reload();
      if (success) { toast(success, undo); haptic('success'); }
      return true;
    } catch (e) {
      console.warn(e);
      haptic('warn');
      toast(e instanceof Error ? friendlyError(e.message) : 'Could not save.');
      return false;
    }
  }, [db, reload, toast]);

  const value = useMemo<Ctx>(() => {
    // Applied before any screen renders so every formatted amount follows the eye button.
    setMasked(data.settings.hideAmounts === true);
    const balances = accountBalances(data.accounts, data.transactions);
    // Saved rates win; anything else comes from the last live download.
    const fx = data.settings.fx as { perUnit?: Record<string, number> } | undefined;
    const rates: RateMap = new Map([...Object.entries(fx?.perUnit ?? {}), ...data.rates.map(r => [r.currency, r.perUnit] as [string, number])]);
    const accCur = new Map(data.accounts.map(a => [a.id, a.currency || BASE]));
    const rtx = inBase(data.transactions, accCur, rates);
    const baseBalances = new Map([...balances].map(([id, v]) => [id, toBase(v, accCur.get(id) ?? BASE, rates)]));
    const curOf = (id: string | null | undefined) => (id ? accCur.get(id) : undefined) ?? BASE;
    const fmt = (minor: number, id: string | null | undefined, opts?: { sign?: boolean; cents?: boolean | 'auto' }) => money(minor, curOf(id), opts);
    const plannedBase = {
      recurring: data.recurring.map(r => ({ ...r, amount: toBase(r.amount, curOf(r.accountId), rates) })),
      installments: data.installments.map(i => ({ ...i, monthlyAmount: toBase(i.monthlyAmount, curOf(i.accountId), rates) })),
    };
    const goalFunds = data.goals.filter(g => !g.archived).reduce((s, g) => s + goalFund(g, rtx), 0);
    // An account linked to two goals counts once.
    const linkedIds = new Set(data.goals.filter(g => !g.archived).flatMap(g => safeJson<string[]>(g.accountIds, [])));
    const goalLinked = [...linkedIds].reduce((s, id) => s + Math.max(0, baseBalances.get(id) ?? 0), 0);
    const parseCats = data.categories.map(c => ({ ...c, keywords: safeJson<string[]>(c.keywords, []) }));
    return {
      db, data, balances, baseBalances, rtx, rates, missing: missingRates(data.accounts, rates), curOf, fmt, goalFunds, goalLinked, plannedBase, parseCats, cats: data.categories,
      catById: new Map(data.categories.map(c => [c.id, c])), accById: new Map(data.accounts.map(a => [a.id, a])),
      reload, act, toast, toastState, dismissToast,
    };
  }, [db, data, reload, act, toast, toastState, dismissToast]);

  // Fix the peso value of foreign-currency entries the first time they're seen with a rate, so last
  // month's dollars don't change every time the rate does.
  const { rates, curOf } = value;
  useEffect(() => {
    const rows: [string, number][] = [];
    for (const t of [...data.transactions, ...data.deleted]) {
      if (t.baseAmount != null || !t.accountId) continue;
      const v = snapshotBase(t, curOf(t.accountId), t.toAccountId ? curOf(t.toAccountId) : null, rates);
      if (v != null) rows.push([t.id, v]);
    }
    if (!rows.length) return;
    const id = setTimeout(() => { try { freezeBaseAmounts(db, rows); reload(); } catch (e) { console.warn('freeze', e); } }, 0);
    return () => clearTimeout(id);
  }, [db, data, rates, curOf, reload]);

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData(): Ctx {
  const v = useContext(DataCtx);
  if (!v) throw new Error('useData outside DataProvider');
  return v;
}

export function safeJson<T>(s: string | null | undefined, fallback: T): T {
  try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
}

function friendlyError(msg: string): string {
  if (/FOREIGN KEY/i.test(msg)) return 'Something else still uses this. Archive it instead.';
  if (/CHECK constraint/i.test(msg)) return 'That amount or combination isn’t allowed.';
  return msg;
}
