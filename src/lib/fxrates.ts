// Live exchange rates. Online only when refreshing; everything else uses the last rates saved on the phone.
// Primary: FXRatesAPI (free, no key, updates hourly). Fallback: open.er-api.com (free, no key, daily).
import { BASE, RATE_SCALE } from './currency';

export interface LiveRates {
  /** Pesos for one unit of each currency, × RATE_SCALE. */
  perUnit: Record<string, number>;
  source: string;
  /** When the provider says the rates are from (epoch ms). */
  at: number;
}

export const PROVIDERS = [
  { name: 'FXRatesAPI', url: `https://api.fxratesapi.com/latest?base=${BASE}&resolution=1h&amount=1&format=json` },
  { name: 'ExchangeRate-API', url: `https://open.er-api.com/v6/latest/${BASE}` },
] as const;

/** Both providers answer "how much X is one peso". Flip it to "how many pesos is one X". */
function invert(rates: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [code, v] of Object.entries(rates)) {
    if (code === BASE || typeof v !== 'number' || !(v > 0) || !/^[A-Z]{3}$/.test(code)) continue;
    out[code] = Math.round(RATE_SCALE / v);
  }
  return out;
}

export function parseProvider(name: string, json: unknown, now = Date.now()): LiveRates | null {
  const j = json as Record<string, unknown> | null;
  if (!j || typeof j !== 'object' || !j.rates || typeof j.rates !== 'object') return null;
  if (name === 'FXRatesAPI') {
    if (j.success !== true || j.base !== BASE) return null;
    const at = typeof j.timestamp === 'number' ? j.timestamp * 1000 : now;
    return { perUnit: invert(j.rates as Record<string, unknown>), source: name, at };
  }
  if (j.result !== 'success' || j.base_code !== BASE) return null;
  const at = typeof j.time_last_update_unix === 'number' ? j.time_last_update_unix * 1000 : now;
  return { perUnit: invert(j.rates as Record<string, unknown>), source: name, at };
}

export async function fetchLiveRates(fetcher: typeof fetch = fetch, timeoutMs = 10_000): Promise<LiveRates> {
  let lastError = 'No internet connection.';
  for (const p of PROVIDERS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetcher(p.url, { signal: ctrl.signal });
      if (!res.ok) { lastError = `${p.name} answered ${res.status}.`; continue; }
      const parsed = parseProvider(p.name, await res.json());
      if (parsed && Object.keys(parsed.perUnit).length) return parsed;
      lastError = `${p.name} sent something unexpected.`;
    } catch (e) {
      lastError = e instanceof Error && e.name === 'AbortError' ? 'The rate service took too long.' : 'No internet connection.';
    } finally { clearTimeout(timer); }
  }
  throw new Error(`Couldn’t get live rates. ${lastError}`);
}

/** Refresh in the background when rates are older than this. */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
