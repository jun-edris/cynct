// All amounts are integer centavos. ₱1,234.50 is 123450.

export function toCentavos(input: string | number): number {
  if (typeof input === 'number') return Math.round(input * 100);
  const cleaned = String(input).replace(/[₱,\s]/g, '').toLowerCase();
  const m = cleaned.match(/^(\d+(?:\.\d{1,2})?)(k|m)?$/);
  if (!m) return NaN;
  let value = parseFloat(m[1]);
  if (m[2] === 'k') value *= 1_000;
  if (m[2] === 'm') value *= 1_000_000;
  return Math.round(value * 100);
}

/** Accepts a leading minus, for balances and corrections. */
export function toSignedCentavos(input: string): number {
  const s = String(input).trim();
  const neg = /^[-−]/.test(s);
  const v = toCentavos(s.replace(/^[-−+]/, ''));
  return neg ? -v : v;
}

const whole = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Privacy mode (the eye button): every formatted amount shows as dots. Inputs aren't affected.
let masked = false;
export function setMasked(on: boolean) { masked = on; }
export const isMasked = () => masked;
const DOTS = '••••';

export function peso(c: number, opts: { cents?: boolean | 'auto'; sign?: boolean } = {}): string {
  if (masked) return `₱${DOTS}`;
  const { cents: showC = 'auto', sign = false } = opts;
  const abs = Math.abs(c);
  const useCents = showC === true || (showC === 'auto' && abs % 100 !== 0);
  const body = (useCents ? cents : whole).format(abs / 100);
  const prefix = c < 0 ? '−' : sign && c > 0 ? '+' : '';
  return `${prefix}₱${body}`;
}

export function compactPeso(c: number): string {
  if (masked) return `₱${DOTS}`;
  const v = Math.abs(c) / 100;
  const neg = c < 0 ? '−' : '';
  if (v >= 1_000_000) return `${neg}₱${(v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, '')}M`;
  if (v >= 10_000) return `${neg}₱${Math.round(v / 1000)}k`;
  return `${neg}₱${whole.format(v)}`;
}

/**
 * Formats a number while it's being typed: "1234567.8" → "1,234,567.8".
 * Keeps one decimal point and at most `decimals` digits after it; leaves text with letters (like "5k") alone.
 */
export function groupDigits(s: string, decimals = 2): string {
  if (/[a-z]/i.test(s)) return s;
  // A leading minus (balances you owe, corrections) is kept.
  const sign = /^\s*[-−]/.test(s) ? '-' : '';
  const t = s.replace(/[^\d.]/g, '');
  const dot = t.indexOf('.');
  let int = dot >= 0 ? t.slice(0, dot) : t;
  const dec = dot >= 0 ? t.slice(dot + 1).replace(/\./g, '').slice(0, decimals) : null;
  int = int.replace(/^0+(?=\d)/, '');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + (dec !== null ? `${grouped || '0'}.${dec}` : grouped);
}

/** Plain number for a text field: 123450 → "1234.5" */
export function inputValue(c: number | null | undefined): string {
  if (!c) return '';
  return (c / 100).toString();
}

export function futureValue(monthly: number, months: number, annualRate = 0): number {
  if (annualRate === 0) return monthly * months;
  const r = annualRate / 12;
  return Math.round(monthly * ((Math.pow(1 + r, months) - 1) / r));
}

export function requiredMonthly(target: number, saved: number, months: number, annualRate = 0): number {
  if (months <= 0) return Math.max(0, target - saved);
  const r = annualRate / 12;
  const grown = r === 0 ? saved : saved * Math.pow(1 + r, months);
  const remaining = target - grown;
  if (remaining <= 0) return 0;
  if (r === 0) return Math.ceil(remaining / months);
  return Math.ceil(remaining / ((Math.pow(1 + r, months) - 1) / r));
}

// ---------- dates: local 'YYYY-MM-DD' strings ----------
const pad = (n: number) => String(n).padStart(2, '0');

export function todayISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const monthKey = (iso: string) => iso.slice(0, 7);

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return todayISO(d);
}

export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1 + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, last));
  return todayISO(target);
}

export function monthsBetween(from: string, to: string): number {
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);
}

export function lastDayOfMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
}

export function monthLabel(key: string, opts: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' }): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-PH', opts);
}

export function dayLabel(iso: string, today = todayISO()): string {
  if (iso === today) return 'Today';
  if (iso === addDays(today, -1)) return 'Yesterday';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  // Dates outside this year carry the year so a 2029 deadline doesn't read like next week.
  if (iso.slice(0, 4) !== today.slice(0, 4)) return parseISO(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  return parseISO(iso).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function uid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Current time in ms. Wrapped so UI handlers stay pure in the eyes of the React compiler. */
export function nowMs(): number { return Date.now(); }
