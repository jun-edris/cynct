import { describe, expect, it } from 'vitest';
import { fetchLiveRates, parseProvider } from '../src/lib/fxrates';

const fxOk = { success: true, timestamp: 1792288740, base: 'PHP', rates: { USD: 0.015864577, EUR: 0.014117905, PHP: 1, bad: 3, ZZZ: 0 } };
const erOk = { result: 'success', base_code: 'PHP', time_last_update_unix: 1792281600, rates: { USD: 0.0159, JPY: 2.5 } };

describe('live rates', () => {
  it('turns "X per peso" into "pesos per X"', () => {
    const r = parseProvider('FXRatesAPI', fxOk)!;
    expect(r.perUnit.USD / 1e6).toBeCloseTo(63.0334, 3);
    expect(r.perUnit.PHP).toBeUndefined();
    expect(r.perUnit.ZZZ).toBeUndefined();
    expect(r.at).toBe(1792288740000);
  });
  it('rejects a wrong base or failure', () => {
    expect(parseProvider('FXRatesAPI', { ...fxOk, base: 'USD' })).toBeNull();
    expect(parseProvider('FXRatesAPI', { success: false })).toBeNull();
    expect(parseProvider('ExchangeRate-API', erOk)!.perUnit.JPY).toBe(400_000);
  });
  it('falls back to the second provider, then reports a readable error', async () => {
    const calls: string[] = [];
    const flaky = (async (url: string) => {
      calls.push(url);
      if (url.includes('fxratesapi')) return { ok: false, status: 429, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => erOk };
    }) as unknown as typeof fetch;
    const r = await fetchLiveRates(flaky);
    expect(r.source).toBe('ExchangeRate-API');
    expect(calls).toHaveLength(2);
    const offline = (async () => { throw new TypeError('Network request failed'); }) as unknown as typeof fetch;
    await expect(fetchLiveRates(offline)).rejects.toThrow('No internet connection');
  });
});
