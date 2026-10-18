import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { loadAll, type AllData, type DB } from '../db/repo';
import { accountBalances, goalFund } from '../lib/ledger';
import type { ParseCategory } from '../lib/parse';
import type { Account, Category } from '../db/schema';

export interface ToastAction { label: string; run: () => void }
export interface ToastState { id: number; message: string; action?: ToastAction }

interface Ctx {
  db: DB;
  data: AllData;
  balances: Map<string, number>;
  goalFunds: number;
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
      if (success) toast(success, undo);
      return true;
    } catch (e) {
      console.warn(e);
      toast(e instanceof Error ? friendlyError(e.message) : 'Could not save.');
      return false;
    }
  }, [db, reload, toast]);

  const value = useMemo<Ctx>(() => {
    const balances = accountBalances(data.accounts, data.transactions);
    const goalFunds = data.goals.filter(g => !g.archived).reduce((s, g) => s + goalFund(g, data.transactions), 0);
    const parseCats = data.categories.map(c => ({ ...c, keywords: safeJson<string[]>(c.keywords, []) }));
    return {
      db, data, balances, goalFunds, parseCats, cats: data.categories,
      catById: new Map(data.categories.map(c => [c.id, c])), accById: new Map(data.accounts.map(a => [a.id, a])),
      reload, act, toast, toastState, dismissToast,
    };
  }, [db, data, reload, act, toast, toastState, dismissToast]);

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
