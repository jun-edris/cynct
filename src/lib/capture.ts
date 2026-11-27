// Turns captured wallet and bank notifications into draft transactions, and pairs the two halves
// of a transfer between your own accounts (Wise → GoTyme) into one transfer instead of income + expense.
// Pure functions, unit tested against real notification wording.

export type AppId = 'maya' | 'wise' | 'gotyme' | 'gcash';
export const APPS: { id: AppId; name: string; packages: string[]; names: string[] }[] = [
  { id: 'maya', name: 'Maya', packages: ['com.paymaya'], names: ['maya'] },
  { id: 'wise', name: 'Wise', packages: ['com.transferwise.android'], names: ['wise'] },
  { id: 'gotyme', name: 'GoTyme', packages: [], names: ['gotyme', 'gotyme bank', 'gotyme ph'] },
  { id: 'gcash', name: 'GCash', packages: ['com.globe.gcash.android'], names: ['gcash'] },
];

/** Which app a notification came from, by package id or by the app's visible name. */
export function appOf(pkg: string, label: string): AppId | null {
  const l = label.trim().toLowerCase();
  return APPS.find(a => a.packages.includes(pkg) || a.names.includes(l))?.id ?? null;
}

export interface CaptureRow { id: string; app: string; title: string; text: string; postedAt: number }
export interface Parsed {
  id: string; app: string; dir: 'in' | 'out'; amount: number; currency: string;
  who: string | null; // the other side: person or merchant
  via: string | null; // channel or bank: InstaPay, GCash…
  tail: string | null; // last digits of a masked account number
  toSelf: boolean; // the notification itself says it went to your own account
  postedAt: number; text: string;
}

const CODES = 'PHP|USD|EUR|GBP|SGD|AUD|CAD|JPY|HKD|AED|SAR|KRW|CNY|NZD|CHF';
const AMT = `(?:₱|PHP|P(?=\\d)|\\$|US\\$|€|£)?\\s?\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?(?:\\s?(?:${CODES}))?|(?:₱|PHP|P(?=\\d)|\\$|€|£)\\s?\\d+(?:\\.\\d{1,2})?`;
const SYMBOL: Record<string, string> = { '₱': 'PHP', P: 'PHP', PHP: 'PHP', $: 'USD', US$: 'USD', '€': 'EUR', '£': 'GBP' };

/** "₱1,700.00" → 170000 PHP; "55 USD" → 5500 USD; "P1500.00" → 150000 PHP; no currency → PHP. */
export function parseAmount(s: string): { amount: number; currency: string } | null {
  const m = s.trim().match(new RegExp(`^(₱|PHP|P(?=\\d)|US\\$|\\$|€|£)?\\s?([\\d,]+(?:\\.\\d{1,2})?)\\s?(${CODES})?$`));
  if (!m) return null;
  const [whole, dec = ''] = m[2].replace(/,/g, '').split('.');
  const amount = Number(whole) * 100 + Number((dec + '00').slice(0, 2));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, currency: m[3] ?? (m[1] ? SYMBOL[m[1]] : 'PHP') };
}

/** "Rogelio Bocboc G-Xchange, Inc (GCash) 0••••3797." → who Rogelio Bocboc, via GCash, tail 3797 */
export function splitParty(raw: string): { who: string | null; via: string | null; tail: string | null } {
  let s = raw.trim().replace(/[.\s]+$/, '');
  // A plain phone number ("+639672589889") is the person's own handle: keep it whole, its last 4 digits are the tail.
  if (/^\+?\d[\d\s-]{9,}$/.test(s)) return { who: s, via: null, tail: s.replace(/\D/g, '').slice(-4) };
  const tailM = s.match(/\s*[0-9]?[•*xX·]{2,}\s?(\d{3,4})$/);
  const tail = tailM ? tailM[1] : null;
  if (tailM) s = s.slice(0, tailM.index).trim();
  const viaM = s.match(/\(([^)]+)\)\s*$/) ?? s.match(/\/\s*([^/]+)$/);
  const via = viaM ? viaM[1].trim() : null;
  if (viaM) s = s.slice(0, viaM.index).trim();
  // Drop the bank's company name after the person's name: "Rogelio Bocboc G-Xchange, Inc" → "Rogelio Bocboc"
  if (via) s = /^\S+,?\s+Inc\.?$/i.test(s) ? '' : s.replace(/\s+\S+,?\s+Inc\.?$/i, '').trim();
  return { who: s || via, via, tail };
}

const RULES: { re: RegExp; dir: 'in' | 'out'; self?: boolean; who?: number; via?: number; party?: number }[] = [
  // Wise: "Dale Edwin Johnson Jr. sent you 55 USD. It's in your account…"
  { re: new RegExp(`^(.+?)\\s+sent you\\s+(${AMT})`, 'i'), dir: 'in', who: 1 },
  // GoTyme / Maya: "You received ₱1,700.00 from J. E. B. Buico." / "You received 10,000.00 in your wallet via InstaPay"
  { re: new RegExp(`you(?:'ve)? received\\s+(${AMT})\\s+from\\s+(.+)$`, 'i'), dir: 'in', party: 2 },
  { re: new RegExp(`you(?:'ve)? received\\s+(${AMT})(?:\\s+in your (?:wallet|account))?(?:\\s+via\\s+(.+?))?\\.?$`, 'i'), dir: 'in', via: 2 },
  // Wise: "Your transfer of 2,500 PHP is now in your account." (you sent it to your own account)
  { re: new RegExp(`your transfer of\\s+(${AMT})\\s+is now in your account`, 'i'), dir: 'out', self: true },
  // GoTyme: "You sent P1500.00 to …" · Maya: "Success! You transferred ₱467.00 to G-Xchange Inc. / GCash."
  { re: new RegExp(`you (?:sent|transferred)\\s+(${AMT})\\s+to\\s+(.+)$`, 'i'), dir: 'out', party: 2 },
  // Maya: "You paid ₱9,000.00 at PMP Neomoney INC."
  { re: new RegExp(`you paid\\s+(${AMT})\\s+(?:at|to|for)\\s+(.+)$`, 'i'), dir: 'out', who: 2 },
  { re: new RegExp(`(${AMT})\\s+(?:has been|was)\\s+(?:credited|deposited|added)`, 'i'), dir: 'in' },
  { re: new RegExp(`(${AMT})\\s+(?:has been|was)\\s+(?:debited|deducted|charged|sent)`, 'i'), dir: 'out' },
  { re: new RegExp(`(?:cash[- ]?in|top[- ]?up) of\\s+(${AMT})`, 'i'), dir: 'in' },
];

export function parseCapture(c: CaptureRow): Parsed | null {
  const text = c.text.replace(/\s+/g, ' ').trim();
  for (const r of RULES) {
    const m = text.match(r.re);
    if (!m) continue;
    const amtIdx = r.who === 1 ? 2 : 1;
    const amt = parseAmount(m[amtIdx]);
    if (!amt) continue;
    let who: string | null = null, via: string | null = null, tail: string | null = null;
    if (r.who) who = m[r.who].trim().replace(/[.\s]+$/, '') || null;
    if (r.via && m[r.via]) via = m[r.via].trim().replace(/[.\s]+$/, '');
    if (r.party && m[r.party]) ({ who, via, tail } = splitParty(m[r.party]));
    return { id: c.id, app: c.app, dir: r.dir, ...amt, who, via, tail, toSelf: !!r.self, postedAt: c.postedAt, text };
  }
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/** "J. E. B. Buico" matches "Juned E. B. Buico", "JEB Buico" or exactly what you typed as one of your names. */
export function isMe(who: string | null, myNames: string[]): boolean {
  if (!who) return false;
  const w = norm(who);
  if (!w) return false;
  return myNames.some(n => {
    if (norm(n) === w) return true;
    const a = who.toLowerCase().split(/[\s.]+/).filter(Boolean), b = n.toLowerCase().split(/[\s.]+/).filter(Boolean);
    if (a.length < 2 || b.length < 2 || a[a.length - 1] !== b[b.length - 1]) return false;
    // Same surname, and the given names line up by initial.
    const ia = a.slice(0, -1).map(x => x[0]).join(''), ib = b.slice(0, -1).map(x => x[0]).join('');
    return ia === ib;
  });
}

export interface Draft {
  id: string; ids: string[];
  kind: 'expense' | 'income' | 'transfer';
  amount: number; currency: string;
  app: string | null; // expense/income: where it happened
  fromApp: string | null; toApp: string | null; // transfer ends; null = pick it yourself
  who: string | null; via: string | null; note: string;
  postedAt: number;
  check: string | null; // something the person should look at before adding
}

const PAIR_WINDOW = 30 * 60 * 1000;
const appName = (id: string | null) => APPS.find(a => a.id === id)?.name ?? id ?? '';

/**
 * Builds drafts from parsed notifications. Money that left one of your apps and arrived in another,
 * same amount and currency within 30 minutes, becomes one transfer. Money sent to yourself
 * (your own name or account number) that has no matching half becomes a transfer with one end to pick.
 */
export function buildDrafts(items: Parsed[], my: { names: string[]; tails: string[] }): Draft[] {
  const sorted = [...items].sort((a, b) => a.postedAt - b.postedAt);
  const used = new Set<string>();
  const out: Draft[] = [];
  const selfish = (p: Parsed) => p.toSelf || isMe(p.who, my.names) || (!!p.tail && my.tails.includes(p.tail));

  for (const o of sorted) {
    if (o.dir !== 'out' || used.has(o.id)) continue;
    const match = sorted
      .filter(i => i.dir === 'in' && !used.has(i.id) && i.app !== o.app && i.amount === o.amount && i.currency === o.currency && Math.abs(i.postedAt - o.postedAt) <= PAIR_WINDOW)
      .sort((a, b) => Number(selfish(b)) - Number(selfish(a)) || Math.abs(a.postedAt - o.postedAt) - Math.abs(b.postedAt - o.postedAt))[0];
    if (!match) continue;
    used.add(o.id); used.add(match.id);
    out.push({ id: `${o.id}|${match.id}`, ids: [o.id, match.id], kind: 'transfer', amount: o.amount, currency: o.currency, app: null,
      fromApp: o.app, toApp: match.app, who: null, via: o.via ?? match.via, note: `${appName(o.app)} → ${appName(match.app)}`, postedAt: Math.min(o.postedAt, match.postedAt), check: null });
  }
  for (const p of sorted) {
    if (used.has(p.id)) continue;
    used.add(p.id);
    if (selfish(p)) {
      out.push({ id: p.id, ids: [p.id], kind: 'transfer', amount: p.amount, currency: p.currency, app: null,
        fromApp: p.dir === 'out' ? p.app : null, toApp: p.dir === 'in' ? p.app : null, who: p.who, via: p.via,
        note: p.dir === 'out' ? `From ${appName(p.app)} to your other account` : `Into ${appName(p.app)} from your other account`, postedAt: p.postedAt,
        check: p.dir === 'out' ? 'Pick the account it went to.' : 'Pick the account it came from.' });
      continue;
    }
    const label = p.who ?? p.via ?? null;
    out.push({ id: p.id, ids: [p.id], kind: p.dir === 'in' ? 'income' : 'expense', amount: p.amount, currency: p.currency, app: p.app,
      fromApp: null, toApp: null, who: p.who, via: p.via,
      note: label ? (p.dir === 'in' ? `From ${label}` : label) : p.dir === 'in' ? `Received in ${appName(p.app)}` : `Sent from ${appName(p.app)}`,
      postedAt: p.postedAt,
      // Money arriving with no sender named could be from yourself (another bank via InstaPay).
      check: p.dir === 'in' && !p.who ? 'No sender named. If it came from another account of yours, make it a transfer.' : null });
  }
  return out.sort((a, b) => b.postedAt - a.postedAt);
}

/** Which of your accounts an app's money belongs to: the linked accounts, matching currency first. */
export function accountFor(app: string | null, currency: string, links: Record<string, string[]>,
  accounts: { id: string; name: string; currency: string; archived: boolean }[]): string | null {
  if (!app) return null;
  const live = accounts.filter(a => !a.archived);
  const linked = (links[app] ?? []).map(id => live.find(a => a.id === id)).filter(Boolean) as typeof live;
  const pool = linked.length ? linked : live.filter(a => norm(a.name).includes(norm(appName(app) || app)));
  return (pool.find(a => a.currency === currency) ?? pool[0])?.id ?? null;
}
