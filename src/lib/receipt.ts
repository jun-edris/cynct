// Turns OCR text from a receipt into a best guess: total, date, merchant, plus every amount found
// so the person can tap the right one when the guess is wrong. Pure functions, unit tested.

export interface ReceiptGuess {
  total: number | null; // centavos
  date: string | null; // YYYY-MM-DD
  merchant: string | null;
  amounts: number[]; // centavos, unique, largest first
  lines: string[];
}

const AMOUNT_RE = /(?:₱|php|p)?\s*(\d{1,3}(?:[,\s]\d{3})+|\d+)[.,](\d{2})(?!\d)/gi;
const TOTAL_RE = /\b(grand\s*total|total\s*amount\s*due|amount\s*due|total\s*due|total\s*sales|net\s*total|total\s*amount|amount\s*payable|total)\b/i;
const NOT_TOTAL_RE = /\b(sub\s*-?\s*total|subtotal|vat(able)?|vat-?exempt|zero\s*rated|discount|less|tax|service\s*charge|qty|items?\s*count|no\.?\s*of\s*items|savings|points)\b/i;
const CASH_RE = /\b(cash|tendered|payment|paid|gcash|maya|card|credit|debit)\b/i;
const CHANGE_RE = /\b(change|sukli)\b/i;
const SKIP_MERCHANT_RE = /(official\s*receipt|sales\s*invoice|invoice|receipt|vat\s*reg|non-?vat|\btin\b|\bmin\b|\bs\/?n\b|\bpos\b|permit|ptu|address|tel\.?|phone|welcome|thank|cashier|date|time|table|order|trans|branch|^\W*$)/i;

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

export function amountsIn(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(AMOUNT_RE)) {
    const whole = m[1].replace(/[,\s]/g, '');
    const v = Number(whole) * 100 + Number(m[2]);
    if (v > 0 && v < 100_000_000_00) out.push(v);
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');
function valid(y: number, m: number, d: number, today: string): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return null;
  // Receipts are recent: within two years back, and not in the future.
  const [ty] = today.split('-').map(Number);
  if (iso > today || y < ty - 2) return null;
  return iso;
}

export function findDate(text: string, today: string): string | null {
  const tries: [RegExp, (m: RegExpMatchArray) => string | null][] = [
    [/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g, m => valid(+m[1], +m[2], +m[3], today)],
    // Philippine receipts are month-first: 10/18/2026, 10-18-26
    [/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g, m => valid(+m[3], +m[1], +m[2], today) ?? valid(+m[3], +m[2], +m[1], today)],
    [/\b([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})\b/gi, m => { const mo = MONTHS[m[1].toLowerCase().slice(0, m[1].length >= 4 && m[1].toLowerCase().startsWith('sept') ? 4 : 3)]; return mo ? valid(+m[3], mo, +m[2], today) : null; }],
    [/\b(\d{1,2})[\s-]([a-z]{3,9})\.?[\s-,]+(\d{2,4})\b/gi, m => { const mo = MONTHS[m[2].toLowerCase().slice(0, 3)]; return mo ? valid(+m[3], mo, +m[1], today) : null; }],
  ];
  for (const [re, fn] of tries) {
    for (const m of text.matchAll(re)) { const d = fn(m); if (d) return d; }
  }
  return null;
}

function findMerchant(lines: string[]): string | null {
  for (const raw of lines.slice(0, 6)) {
    const l = raw.trim();
    const letters = (l.match(/[a-z]/gi) ?? []).length;
    if (letters < 3 || letters < l.replace(/\s/g, '').length * 0.5) continue;
    if (SKIP_MERCHANT_RE.test(l) || amountsIn(l).length) continue;
    const clean = l.replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} &'.,-]/gu, '').trim();
    if (clean.length < 3) continue;
    // Title-case shouty receipt headers: "JOLLIBEE TAGBILARAN" → "Jollibee Tagbilaran"
    return clean.length > 40 ? clean.slice(0, 40) : clean === clean.toUpperCase() ? clean.toLowerCase().replace(/\b\p{L}/gu, ch => ch.toUpperCase()) : clean;
  }
  return null;
}

export function parseReceipt(blocks: string[], today: string): ReceiptGuess {
  const lines = blocks.flatMap(b => b.split(/\r?\n/)).map(l => l.trim()).filter(Boolean);
  const all = new Set<number>();
  for (const l of lines) for (const v of amountsIn(l)) all.add(v);
  const amounts = [...all].sort((a, b) => b - a);

  let total: number | null = null;
  let cash: number | null = null, change: number | null = null;
  // Labeled amounts: on the same line, or on the next line when OCR split label and number.
  const labeled = (i: number): number | null => {
    const same = amountsIn(lines[i]);
    if (same.length) return same[same.length - 1];
    const next = lines[i + 1] ? amountsIn(lines[i + 1]) : [];
    return next.length && !/[a-z]{3,}/i.test(lines[i + 1].replace(/php|p(?=\d)/gi, '')) ? next[0] : null;
  };
  const totals: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (CHANGE_RE.test(l)) { change = change ?? labeled(i); continue; }
    if (TOTAL_RE.test(l) && !NOT_TOTAL_RE.test(l)) { const v = labeled(i); if (v) totals.push(v); continue; }
    if (CASH_RE.test(l) && !TOTAL_RE.test(l)) { cash = cash ?? labeled(i); }
  }
  // "Amount due" and "grand total" beat a plain "total"; among equals, the largest (a total is never below its parts).
  if (totals.length) total = Math.max(...totals);
  if (total === null && cash !== null && change !== null && cash > change) {
    const diff = cash - change;
    if (all.has(diff)) total = diff;
  }
  if (total === null) {
    const pool = amounts.filter(v => v !== cash);
    total = pool[0] ?? null;
  }
  return { total, date: findDate(lines.join('\n'), today), merchant: findMerchant(lines), amounts: amounts.slice(0, 12), lines };
}

// Store names that say what a receipt is for. Checked only if the category still exists.
const STORE_HINTS: [RegExp, string][] = [
  [/\b(jollibee|mcdo|mcdonald|chowking|mang\s*inasal|greenwich|kfc|shakey|max'?s|army\s*navy|bonchon|pizza|grill|restaurant|resto|kitchen|eatery|carinderia)\b/i, 'food.eatout'],
  [/\b(starbucks|coffee|cafe|caf[ée]|tea|milk\s*tea|bakery|bakeshop|donut)\b/i, 'food.coffee'],
  [/\b(supermarket|grocery|groceries|puregold|savemore|alturas|island\s*city\s*mall|marketplace|7-?eleven|ministop|alfamart|uncle\s*john)\b/i, 'food.groceries'],
  [/\b(petron|shell|caltex|seaoil|phoenix|cleanfuel|unioil|gasoline|diesel|unleaded)\b/i, 'transport.gas'],
  [/\b(mercury\s*drug|watsons|rose\s*pharmacy|south\s*star|pharmacy|drugstore|botica|clinic|hospital|diagnostic)\b/i, 'health'],
  [/\b(boheco|electric\s*coop|meralco)\b/i, 'bills.electric'],
  [/\b(pldt|converge|globe\s*fiber)\b/i, 'bills.internet'],
  [/\b(wilcon|hardware|cement|construction\s*supply|ace\s*hardware)\b/i, 'house'],
  [/\b(sm\s*(store|dept)|department\s*store|uniqlo|h&m|penshoppe|bench)\b/i, 'shopping'],
];

/** Suggests an expense category from the store name, then from your own category keywords. */
export function guessCategory(g: ReceiptGuess, cats: { id: string; kind: string; name: string; keywords: string[]; archived?: boolean }[]): string | null {
  const live = new Set(cats.filter(c => c.kind === 'expense' && !c.archived).map(c => c.id));
  const head = [g.merchant ?? '', ...g.lines.slice(0, 8)].join(' ');
  for (const [re, id] of STORE_HINTS) if (re.test(head) && live.has(id)) return id;
  const words = new Set(g.lines.join(' ').toLowerCase().split(/[^a-z0-9ñ]+/).filter(w => w.length > 2));
  let best: { id: string; hits: number } | null = null;
  for (const c of cats) {
    if (!live.has(c.id)) continue;
    const hits = c.keywords.filter(k => words.has(k)).length + (words.has(c.name.toLowerCase()) ? 1 : 0);
    if (hits && (!best || hits > best.hits)) best = { id: c.id, hits };
  }
  return best?.id ?? null;
}

export interface OcrLine { text: string; frame: { left: number; top: number; right: number; bottom: number } }

/**
 * Rebuilds printed rows from OCR lines. ML Kit often returns "TOTAL" and "1,234.50" as separate blocks
 * (left and right columns); lines whose vertical middles sit within half a line height of each other are
 * joined left-to-right so the label and its amount end up on one row again.
 */
export function rowsFromLines(lines: OcrLine[]): string[] {
  const items = lines.filter(l => l.text.trim()).map(l => {
    const h = Math.max(1, l.frame.bottom - l.frame.top);
    return { text: l.text.trim(), left: l.frame.left, mid: (l.frame.top + l.frame.bottom) / 2, h };
  }).sort((a, b) => a.mid - b.mid);
  const rows: { mid: number; h: number; parts: typeof items }[] = [];
  for (const it of items) {
    const row = rows.find(r => Math.abs(r.mid - it.mid) <= Math.min(r.h, it.h) * 0.5);
    if (row) { row.parts.push(it); row.mid = (row.mid * (row.parts.length - 1) + it.mid) / row.parts.length; }
    else rows.push({ mid: it.mid, h: it.h, parts: [it] });
  }
  return rows.sort((a, b) => a.mid - b.mid).map(r => r.parts.sort((a, b) => a.left - b.left).map(p => p.text).join('  '));
}
