// Multi-currency. Everything is stored in the account's own currency (integer minor units);
// totals across accounts are converted to pesos with the rates you set.
import { peso } from './money';

export const BASE = 'PHP';

export interface CurrencyInfo { code: string; name: string; symbol: string }
export const CURRENCIES: CurrencyInfo[] = [
  { code: 'PHP', name: 'Philippine peso', symbol: '₱' },
  { code: 'USD', name: 'US dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British pound', symbol: '£' },
  { code: 'JPY', name: 'Japanese yen', symbol: '¥' },
  { code: 'TWD', name: 'Taiwan dollar', symbol: 'NT$' },
  { code: 'AED', name: 'UAE dirham', symbol: 'AED ' },
  { code: 'AUD', name: 'Australian dollar', symbol: 'A$' },
  { code: 'CAD', name: 'Canadian dollar', symbol: 'CA$' },
  { code: 'SGD', name: 'Singapore dollar', symbol: 'S$' },
  { code: 'HKD', name: 'Hong Kong dollar', symbol: 'HK$' },
  { code: 'KRW', name: 'South Korean won', symbol: '₩' },
  { code: 'CNY', name: 'Chinese yuan', symbol: 'CN¥' },
  { code: 'SAR', name: 'Saudi riyal', symbol: 'SAR ' },
  { code: 'QAR', name: 'Qatari riyal', symbol: 'QAR ' },
  { code: 'KWD', name: 'Kuwaiti dinar', symbol: 'KWD ' },
  { code: 'BHD', name: 'Bahraini dinar', symbol: 'BHD ' },
  { code: 'OMR', name: 'Omani rial', symbol: 'OMR ' },
  { code: 'NZD', name: 'New Zealand dollar', symbol: 'NZ$' },
  { code: 'CHF', name: 'Swiss franc', symbol: 'CHF ' },
  { code: 'THB', name: 'Thai baht', symbol: '฿' },
  { code: 'MYR', name: 'Malaysian ringgit', symbol: 'RM' },
  { code: 'IDR', name: 'Indonesian rupiah', symbol: 'Rp' },
  { code: 'VND', name: 'Vietnamese dong', symbol: '₫' },
  { code: 'INR', name: 'Indian rupee', symbol: '₹' },
  { code: 'BND', name: 'Brunei dollar', symbol: 'B$' },
  { code: 'KHR', name: 'Cambodian riel', symbol: '៛' },
  { code: 'LAK', name: 'Lao kip', symbol: '₭' },
  { code: 'MMK', name: 'Myanmar kyat', symbol: 'K' },
  { code: 'LKR', name: 'Sri Lankan rupee', symbol: 'Rs' },
  { code: 'PKR', name: 'Pakistani rupee', symbol: 'Rs' },
  { code: 'BDT', name: 'Bangladeshi taka', symbol: '৳' },
  { code: 'DKK', name: 'Danish krone', symbol: 'kr' },
  { code: 'SEK', name: 'Swedish krona', symbol: 'kr' },
  { code: 'NOK', name: 'Norwegian krone', symbol: 'kr' },
  { code: 'PLN', name: 'Polish złoty', symbol: 'zł' },
  { code: 'CZK', name: 'Czech koruna', symbol: 'Kč' },
  { code: 'HUF', name: 'Hungarian forint', symbol: 'Ft' },
  { code: 'RON', name: 'Romanian leu', symbol: 'lei' },
  { code: 'TRY', name: 'Turkish lira', symbol: '₺' },
  { code: 'ILS', name: 'Israeli shekel', symbol: '₪' },
  { code: 'EGP', name: 'Egyptian pound', symbol: 'E£' },
  { code: 'ZAR', name: 'South African rand', symbol: 'R' },
  { code: 'NGN', name: 'Nigerian naira', symbol: '₦' },
  { code: 'KES', name: 'Kenyan shilling', symbol: 'KSh' },
  { code: 'RUB', name: 'Russian ruble', symbol: '₽' },
  { code: 'MXN', name: 'Mexican peso', symbol: 'MX$' },
  { code: 'BRL', name: 'Brazilian real', symbol: 'R$' },
  { code: 'ARS', name: 'Argentine peso', symbol: 'AR$' },
  { code: 'CLP', name: 'Chilean peso', symbol: 'CLP$' },
  { code: 'COP', name: 'Colombian peso', symbol: 'COP$' },
  { code: 'PEN', name: 'Peruvian sol', symbol: 'S/' },
];
const INFO = new Map(CURRENCIES.map(c => [c.code, c]));
export const currencyInfo = (code: string): CurrencyInfo => INFO.get(code) ?? { code, name: code, symbol: `${code} ` };
export const symbolOf = (code: string) => currencyInfo(code).symbol;

/** Formats minor units in any currency. Pesos use the app's usual formatter. */
export function money(minor: number, code = BASE, opts: { sign?: boolean; cents?: boolean | 'auto' } = {}): string {
  if (code === BASE) return peso(minor, opts);
  const s = peso(minor, opts); // same grouping and sign rules, then swap the symbol
  return s.replace('₱', symbolOf(code));
}

/** Rate map: currency → pesos per unit × 1e6. */
export type RateMap = Map<string, number>;
export const RATE_SCALE = 1_000_000;

export function toBase(minor: number, code: string, rates: RateMap): number {
  if (code === BASE) return minor;
  const r = rates.get(code);
  return r ? Math.round((minor * r) / RATE_SCALE) : 0;
}
export function fromBase(minorPhp: number, code: string, rates: RateMap): number {
  if (code === BASE) return minorPhp;
  const r = rates.get(code);
  return r ? Math.round((minorPhp * RATE_SCALE) / r) : 0;
}
/** Converts between any two currencies through pesos. Returns null if a rate is missing. */
export function convert(minor: number, from: string, to: string, rates: RateMap): number | null {
  if (from === to) return minor;
  if ((from !== BASE && !rates.has(from)) || (to !== BASE && !rates.has(to))) return null;
  return fromBase(toBase(minor, from, rates), to, rates);
}

/** Short rate for display: 63.033512 → "63.0335". */
export const rateLabel = (perUnit: number) => String(Number((perUnit / RATE_SCALE).toFixed(perUnit >= 10 * RATE_SCALE ? 4 : 6)));
export const rateToText = (perUnit: number) => String(Math.round((perUnit / RATE_SCALE) * 1e6) / 1e6);
export const textToRate = (s: string): number => {
  const n = Number(s.replace(/,/g, '').trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n * RATE_SCALE) : NaN;
};

interface TxConv { accountId: string | null; toAccountId: string | null; amount: number; fee?: number; toAmount?: number | null; type: string; baseAmount?: number | null }

/**
 * What a foreign-currency entry is worth in pesos, fixed once so old entries stop moving with today's rate.
 * Uses the exact peso side when the entry has one (paid in pesos from a dollar account, or a transfer that
 * landed in pesos); otherwise the rate at the time it's first seen. Null for peso accounts or with no rate.
 */
export function snapshotBase(
  t: { type: string; amount: number; toAmount?: number | null; origAmount?: number | null; origCurrency?: string | null },
  from: string, to: string | null, rates: RateMap,
): number | null {
  if (from === BASE) return null;
  if (t.origCurrency === BASE && t.origAmount) return t.amount < 0 ? -t.origAmount : t.origAmount;
  if (t.type === 'transfer' && to === BASE && t.toAmount) return t.toAmount;
  return rates.has(from) ? toBase(t.amount, from, rates) : null;
}

/**
 * Copies of transactions with amounts in pesos, for totals that mix accounts: spending, budgets, goals, debts, forecasts.
 * A transfer keeps the peso value of what left the source account. Returns the same array when every account is in pesos.
 */
export function inBase<T extends TxConv>(txs: T[], accCurrency: Map<string, string>, rates: RateMap): T[] {
  let foreign = false;
  for (const c of accCurrency.values()) if (c !== BASE) { foreign = true; break; }
  if (!foreign) return txs;
  return txs.map(t => {
    const from = t.accountId ? accCurrency.get(t.accountId) ?? BASE : BASE;
    const to = t.toAccountId ? accCurrency.get(t.toAccountId) ?? BASE : BASE;
    if (from === BASE && (t.type !== 'transfer' || to === BASE)) return t;
    // A frozen peso value wins over today's rate; the fee follows the same rate.
    const frozen = from !== BASE && t.baseAmount != null && t.amount !== 0;
    const amount = from === BASE ? t.amount : frozen ? t.baseAmount! : toBase(t.amount, from, rates);
    const fee = from === BASE ? t.fee ?? 0 : frozen ? Math.round((t.fee ?? 0) * t.baseAmount! / t.amount) : toBase(t.fee ?? 0, from, rates);
    let toAmount = t.toAmount;
    if (t.type === 'transfer') {
      if (to === BASE) toAmount = t.toAmount ?? t.amount;
      else if (from === BASE) toAmount = t.amount; // pesos that left are what arrived, in peso terms
      else if (to === from) toAmount = frozen ? t.baseAmount! : toBase(t.toAmount ?? t.amount, to, rates);
      else toAmount = toBase(t.toAmount ?? t.amount, to, rates);
    }
    return { ...t, amount, fee, toAmount };
  });
}

/** Account currencies in use that have no rate yet. */
export function missingRates(accounts: { currency: string; archived: boolean }[], rates: RateMap): string[] {
  return [...new Set(accounts.filter(a => !a.archived && a.currency !== BASE && !rates.has(a.currency)).map(a => a.currency))];
}
