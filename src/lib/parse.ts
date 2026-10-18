// Quick entry: "lunch 180 gcash" → a transaction draft.
//   "lunch 180 gcash"            expense ₱180, Food, GCash, note "lunch"
//   "+100k salary wise"          income
//   "70k wise > house fund"      transfer
//   "spotify 149 maya yesterday" dated yesterday
import { toCentavos, todayISO, addDays } from './money';

export interface ParseAccount { id: string; name: string; archived?: boolean }
export interface ParseCategory { id: string; kind: string; name: string; keywords: string[]; archived?: boolean }

export interface Draft {
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  accountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  note: string;
  date: string;
  errors: string[];
}

const AMOUNT_RE = /^[+-]?₱?\d[\d,]*(?:\.\d{1,2})?[km]?$/i;
const INCOME_WORDS = new Set(['salary', 'sweldo', 'income', 'received', 'payout']);
const TRANSFER_WORDS = new Set(['transfer', 'move', 'save', 'to', '>', '→', '->']);
const YESTERDAY = new Set(['yesterday', 'kahapon']);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const firstWord = (s: string) => s.toLowerCase().split(/[\s&/]+/)[0];

function findAccounts(text: string, accounts: ParseAccount[]) {
  const candidates: { account: ParseAccount; needle: string }[] = [];
  for (const a of accounts) {
    const full = a.name.toLowerCase().trim();
    const first = full.split(/\s+/)[0];
    for (const n of full === first ? [full] : [full, first]) {
      if (n.length >= 2) candidates.push({ account: a, needle: n });
    }
  }
  candidates.sort((x, y) => y.needle.length - x.needle.length);
  let working = ` ${text.toLowerCase()} `;
  const found: { account: ParseAccount; index: number }[] = [];
  for (const { account, needle } of candidates) {
    if (found.some(f => f.account.id === account.id)) continue;
    // No lookbehind: older Hermes builds don't support it.
    const m = new RegExp(`\\s${escapeRe(needle)}(?=\\s)`).exec(working);
    if (!m) continue;
    const at = m.index + 1;
    found.push({ account, index: at });
    working = working.slice(0, at) + ' '.repeat(needle.length) + working.slice(at + needle.length);
  }
  found.sort((x, y) => x.index - y.index);
  return { found: found.map(f => f.account), rest: working.trim().replace(/\s+/g, ' ') };
}

export function parseQuickEntry(
  raw: string,
  ctx: { accounts: ParseAccount[]; categories: ParseCategory[]; defaultAccountId?: string | null; today?: string },
): Draft {
  const today = ctx.today ?? todayISO();
  const text = String(raw || '').trim();
  const r: Draft = { type: 'expense', amount: NaN, accountId: null, toAccountId: null, categoryId: null, note: '', date: today, errors: [] };
  if (!text) { r.errors.push('Type something like "lunch 180 gcash".'); return r; }

  const { found, rest } = findAccounts(text, ctx.accounts.filter(a => !a.archived));
  const cats = ctx.categories.filter(c => !c.archived);
  const leftovers: string[] = [];
  let income = false;
  let transferHint = false;

  for (const tok of rest.split(' ').filter(Boolean)) {
    const lower = tok.toLowerCase();
    if (Number.isNaN(r.amount) && AMOUNT_RE.test(tok)) {
      if (tok.startsWith('+')) income = true;
      r.amount = toCentavos(tok.replace(/^[+-]/, ''));
      continue;
    }
    if (YESTERDAY.has(lower)) { r.date = addDays(today, -1); continue; }
    if (TRANSFER_WORDS.has(lower)) { transferHint = true; continue; }
    if (INCOME_WORDS.has(lower)) income = true;
    leftovers.push(tok);
  }

  const noteWords: string[] = [];
  for (const tok of leftovers) {
    const lower = tok.toLowerCase();
    if (!r.categoryId) {
      // Prefer exact name (subcategories like "Groceries" beat their parent's keywords), then keywords.
      const byName = cats.find(c => c.name.toLowerCase() === lower || firstWord(c.name) === lower);
      const cat = byName ?? cats.find(c => c.keywords.includes(lower));
      if (cat) {
        r.categoryId = cat.id;
        if (cat.kind === 'income') income = true;
        if (!byName) noteWords.push(tok); // keep "lunch" as the note, drop bare "food"
        continue;
      }
    }
    noteWords.push(tok);
  }
  r.note = noteWords.join(' ');

  if (found.length >= 2) {
    r.type = 'transfer';
    r.accountId = found[0].id;
    r.toAccountId = found[1].id;
    r.categoryId = null;
  } else {
    r.type = income ? 'income' : 'expense';
    r.accountId = found[0]?.id ?? ctx.defaultAccountId ?? null;
    const cat = cats.find(c => c.id === r.categoryId);
    if (cat && cat.kind !== r.type) r.categoryId = null;
    if (transferHint && found.length === 1) r.errors.push('Name both accounts for a transfer, like "5k wise > gcash".');
  }

  if (Number.isNaN(r.amount) || r.amount <= 0) r.errors.push('Add an amount, like 150 or 2.5k.');
  if (!r.accountId) r.errors.push('Name an account, like gcash or wise.');
  return r;
}
