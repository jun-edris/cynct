// Glue between the phone's notification listener and the app: pulls captured notifications into the
// database, and turns a draft into a real transaction.
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import Capture, { type RawCapture } from '../../modules/cynct-capture';
import { useData } from './DataContext';
import { addCaptured, newTx, pruneCaptured, setCaptured, upsert, type DB } from '../db/repo';
import { APPS, accountFor, appOf, buildDrafts, parseCapture, type Draft, type Parsed } from '../lib/capture';
import { guessCategory } from '../lib/receipt';
import { convert, type RateMap } from '../lib/currency';
import { todayISO } from '../lib/money';
import type { Account, Captured, Category, Transaction } from '../db/schema';

export interface CapturePrefs { enabled: boolean; links: Record<string, string[]>; names: string[]; tails: string[] }
export const DEFAULT_CAPTURE: CapturePrefs = { enabled: false, links: {}, names: [], tails: [] };
export const readCapture = (s: Record<string, unknown>): CapturePrefs => ({ ...DEFAULT_CAPTURE, ...((s.capture as Partial<CapturePrefs>) ?? {}) });

export const captureSupported = Platform.OS === 'android';
export const accessOn = () => { try { return captureSupported && Capture.isEnabled(); } catch { return false; } };

/** Drains the phone's queue into the database whenever the app comes to the front. Mounted once at the root. */
export function CaptureSync() {
  const { act, data } = useData();
  const prefs = readCapture(data.settings);
  const busy = useRef(false);
  const enabled = prefs.enabled;

  useEffect(() => {
    if (!captureSupported || !enabled) return;
    try {
      Capture.setAllowlist(APPS.flatMap(a => a.packages), APPS.flatMap(a => a.names));
      Capture.rebind();
    } catch { /* module missing in an old build */ }
    const pull = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const raw = JSON.parse(await Capture.drain()) as RawCapture[];
        const rows = raw.filter(r => r && r.key && r.postedAt).map(r => ({
          id: `${r.key}@${r.postedAt}`, app: appOf(r.pkg, r.app) ?? (r.app || r.pkg), title: r.title ?? '', text: r.text ?? '', postedAt: r.postedAt,
        }));
        act(db => { if (rows.length) addCaptured(db, rows); pruneCaptured(db, Date.now() - 60 * 86_400_000); });
      } catch (e) { console.warn('capture', e); }
      busy.current = false;
    };
    pull();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') pull(); });
    return () => sub.remove();
  }, [enabled, act]);
  return null;
}

/** Parsed drafts from everything still waiting, plus captures no rule could read. */
export function draftsFrom(captured: Captured[], prefs: CapturePrefs): { drafts: Draft[]; unread: Captured[] } {
  const waiting = captured.filter(c => c.status === 'new');
  const parsed: Parsed[] = [];
  const unread: Captured[] = [];
  for (const c of waiting) {
    const p = parseCapture(c);
    if (p) parsed.push(p); else unread.push(c);
  }
  return { drafts: buildDrafts(parsed, { names: prefs.names, tails: prefs.tails }), unread };
}

const timeOf = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const dateOf = (ms: number) => todayISO(new Date(ms));

export interface Resolved {
  tx: Transaction | null; // ready to save as is
  missing: string | null; // why it can't be added in one tap
  fromId: string | null; toId: string | null; accountId: string | null;
  categoryId: string | null;
}

/** Works out accounts, currency and category for a draft. Returns a transaction when nothing needs choosing. */
export function resolveDraft(d: Draft, prefs: CapturePrefs, accounts: Account[], cats: Category[], rates: RateMap): Resolved {
  const cur = (id: string | null) => accounts.find(a => a.id === id)?.currency ?? 'PHP';
  const base = { date: dateOf(d.postedAt), time: timeOf(d.postedAt), note: d.note };
  if (d.kind === 'transfer') {
    const fromId = accountFor(d.fromApp, d.currency, prefs.links, accounts);
    const toId = accountFor(d.toApp, d.currency, prefs.links, accounts);
    const out = { fromId, toId, accountId: null, categoryId: null };
    if (!fromId || !toId || fromId === toId) return { tx: null, missing: !d.fromApp || !d.toApp ? 'Pick the other account' : 'Link this app to an account', ...out };
    const fromCur = cur(fromId), toCur = cur(toId);
    // The notification's amount is in its own currency; the transfer amount is in the account the money left.
    const amount = fromCur === d.currency ? d.amount : convert(d.amount, d.currency, fromCur, rates);
    const toAmount = toCur === fromCur ? null : toCur === d.currency ? d.amount : convert(d.amount, d.currency, toCur, rates);
    if (!amount || (toCur !== fromCur && !toAmount)) return { tx: null, missing: `Needs a ${d.currency === fromCur ? toCur : fromCur} rate`, ...out };
    return { tx: newTx({ type: 'transfer', amount, toAmount, accountId: fromId, toAccountId: toId, ...base }), missing: null, ...out };
  }
  const accountId = accountFor(d.app, d.currency, prefs.links, accounts);
  const categoryId = guessCategory({ total: d.amount, date: null, merchant: d.who, amounts: [], lines: [d.who ?? '', d.via ?? ''] },
    cats.filter(c => c.kind === (d.kind === 'income' ? 'income' : 'expense')).map(c => ({ ...c, kind: 'expense', keywords: safeKeywords(c.keywords) })));
  const out = { fromId: null, toId: null, accountId, categoryId };
  if (!accountId) return { tx: null, missing: 'Link this app to an account', ...out };
  const ac = cur(accountId);
  const amount = ac === d.currency ? d.amount : convert(d.amount, d.currency, ac, rates);
  if (!amount) return { tx: null, missing: `Needs a ${d.currency} rate`, ...out };
  return {
    tx: newTx({ type: d.kind, amount, accountId, categoryId, ...base,
      origAmount: ac === d.currency ? null : d.amount, origCurrency: ac === d.currency ? null : d.currency }),
    missing: null, ...out,
  };
}

function safeKeywords(k: unknown): string[] {
  if (Array.isArray(k)) return k as string[];
  try { const v = JSON.parse(String(k ?? '[]')); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function addDraft(db: DB, d: Draft, tx: Transaction) {
  upsert.transaction(db, tx);
  setCaptured(db, d.ids, 'added', tx.id);
}
