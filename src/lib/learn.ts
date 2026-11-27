// Category learning: when you file a payee under a category, Cynct remembers it and uses it next time
// (captured payments first, then the keyword guess). Stored in settings as a small map.
export interface CatMemory { [payee: string]: { id: string; n: number; at: number } }

const LIMIT = 300;

/** "From Dale Johnson #4471" → "dale johnson". Null when too short to be a useful key. */
export function payeeKey(s: string | null | undefined): string | null {
  if (!s) return null;
  const k = s.toLowerCase()
    .replace(/^\s*(received\s+from|sent\s+to|paid\s+to|payment\s+to|from|to)\s+/, '')
    .replace(/[+]?\d[\d\s-]{5,}/g, ' ') // phone and reference numbers
    .replace(/[^a-zñ ]+/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 40);
  return k.length >= 3 ? k : null;
}

/** Records payee → category. Keeps the newest LIMIT entries. Returns a new map (or the same one if nothing to learn). */
export function learn(mem: CatMemory | undefined, payee: string | null | undefined, categoryId: string | null | undefined, now = Date.now()): CatMemory {
  const base = mem ?? {};
  const key = payeeKey(payee);
  if (!key || !categoryId) return base;
  const prev = base[key];
  if (prev && prev.id === categoryId && now - prev.at < 60_000) return base;
  const next: CatMemory = { ...base, [key]: { id: categoryId, n: prev && prev.id === categoryId ? prev.n + 1 : 1, at: now } };
  const keys = Object.keys(next);
  if (keys.length > LIMIT) {
    keys.sort((a, b) => next[a].at - next[b].at).slice(0, keys.length - LIMIT).forEach(k => { delete next[k]; });
  }
  return next;
}

/** The category you last used for this payee, if it still exists. */
export function recall(mem: CatMemory | undefined, payee: string | null | undefined, live: Set<string>): string | null {
  const key = payeeKey(payee);
  if (!key || !mem) return null;
  const hit = mem[key];
  return hit && live.has(hit.id) ? hit.id : null;
}
