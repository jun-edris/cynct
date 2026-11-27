// Reads a screenshot of a Maya transaction screen ("Purchased on", "Sent money to", …) after on-phone OCR,
// for payments that never sent a notification. The result is turned into the same wording Maya's notifications
// use, so it goes through payment capture's review list like any other captured payment.
// OCR text is messy: "₱" often comes back as "P", logos become stray letters, and lines arrive out of order.
import { parseCapture, type CaptureRow, type Parsed } from './capture';

export interface ScreenTx {
  title: string; kind: 'purchase' | 'send' | 'receive' | 'other';
  dir: 'in' | 'out'; amount: number; currency: 'PHP';
  party: string | null; message: string | null;
  postedAt: number | null; ref: string | null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const AMOUNT = /^([-+−–])?\s*(?:₱|PHP|P)\s?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})\b/i;
const DATE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*([AP]M)?/i;
const REF = /\b([0-9A-Z]{4}\s[0-9A-Z]{4}\s[0-9A-Z]{4})\b/;
const STATUS = /\b(completed|successful|pending|processing|failed|cancell?ed|declined|reversed)\b/i;
const LABEL = /^(reference id|payment id|share|get help|maya|details?)\b/i;
const TITLES: { re: RegExp; kind: ScreenTx['kind']; dir: 'in' | 'out' | null }[] = [
  { re: /purchased on|paid (?:to|at|for)|bought|payment to/i, kind: 'purchase', dir: 'out' },
  { re: /sent money to|transferred to|send money|bank transfer/i, kind: 'send', dir: 'out' },
  { re: /received (?:money )?from|money received|cash ?in|added money/i, kind: 'receive', dir: 'in' },
];

/** Drops OCR noise around a value: logo letters ("mM", "a"), stray symbols ("@", "e"). */
function clean(s: string): string {
  return s.split(/\s+/).filter((w, i, all) => {
    const edge = i === 0 || i === all.length - 1;
    return !(edge && w.length <= 2 && !/^\d+$/.test(w));
  }).join(' ').trim();
}

/** Null when the text isn't a completed Maya transaction screen. */
export function parseMayaScreen(rawLines: string[]): ScreenTx | null {
  const lines = rawLines.map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const all = lines.join('\n');
  if (!/\bmaya\b/i.test(all) && !/reference id/i.test(all)) return null;
  const st = all.match(STATUS);
  if (st && !/completed|successful/i.test(st[1])) return null;

  const titleHit = TITLES.find(t => t.re.test(all));
  const title = titleHit ? (lines.find(l => titleHit.re.test(l)) ?? '').replace(/^\W+/, '') : '';

  const amtIdx = lines.findIndex(l => AMOUNT.test(l));
  if (amtIdx < 0) return null;
  const am = lines[amtIdx].match(AMOUNT)!;
  const amount = Math.round(parseFloat(am[2].replace(/,/g, '')) * 100);
  if (!(amount > 0)) return null;
  const dir: 'in' | 'out' = titleHit?.dir ?? (am[1] === '+' ? 'in' : 'out');

  // The other side is the first meaningful line after the amount.
  let party: string | null = null;
  for (const l of lines.slice(amtIdx + 1)) {
    if (STATUS.test(l) || DATE.test(l) || LABEL.test(l) || REF.test(l) || TITLES.some(t => t.re.test(l)) || /^[-–]\s/.test(l)) continue;
    const c = clean(l);
    if (c.length >= 3) { party = c; break; }
  }
  // The amount's own row can carry the name when OCR merges them: "- ₱385.00  +639672589889".
  const sameRow = clean(lines[amtIdx].slice(am[0].length));
  if (!party && sameRow.length >= 3) party = sameRow;

  const msgLine = lines.find((l, i) => i !== amtIdx && /^[-–]\s+\S/.test(l) && !AMOUNT.test(l));
  const message = msgLine ? clean(msgLine.replace(/^[-–]\s+/, '')) || null : null;

  const dm = all.match(DATE);
  let postedAt: number | null = null;
  if (dm) {
    let h = Number(dm[4]) % 12;
    if (dm[6]?.toUpperCase() === 'PM') h += 12;
    if (!dm[6]) h = Number(dm[4]);
    postedAt = new Date(Number(dm[3]), MONTHS.indexOf(dm[1].slice(0, 3).toLowerCase()), Number(dm[2]), h, Number(dm[5])).getTime();
  }

  const refLine = lines.find(l => /reference id/i.test(l) && REF.test(l));
  const ref = (refLine ?? lines.find(l => REF.test(l)) ?? '').match(REF)?.[1] ?? null;

  return { title, kind: titleHit?.kind ?? 'other', dir, amount, currency: 'PHP', party, message, postedAt, ref };
}

const pesos = (minor: number) => `₱${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The screenshot as a captured "notification" in Maya's own wording, so the capture rules read it. */
export function screenToCapture(s: ScreenTx, now = Date.now()): CaptureRow {
  const amt = pesos(s.amount);
  const who = s.party ?? 'someone';
  const text = s.kind === 'purchase' ? `You paid ${amt} at ${who}.`
    : s.kind === 'send' ? `You transferred ${amt} to ${who}.`
    : s.dir === 'in' ? `You received ${amt}${s.party ? ` from ${s.party}` : ''}.`
    : `${amt} was debited${s.party ? ` for ${s.party}` : ''}.`;
  const postedAt = s.postedAt ?? now;
  return { id: `shot:maya:${s.ref ? s.ref.replace(/\s/g, '') : `${s.amount}@${postedAt}`}`, app: 'maya', title: `Screenshot · ${s.title || 'Maya'}`, text, postedAt };
}

/**
 * Already known? A captured notification or a saved transaction with the same amount, direction and time
 * (within 10 minutes) means the screenshot would double it.
 */
export function alreadyKnown(
  p: Parsed,
  captured: CaptureRow[],
  txs: { type: string; amount: number; date: string; time?: string | null; deletedAt?: number | null }[],
): 'captured' | 'recorded' | null {
  const near = (a: number, b: number) => Math.abs(a - b) <= 10 * 60_000;
  for (const c of captured) {
    if (c.id === p.id) return 'captured';
    const q = parseCapture(c);
    if (q && q.dir === p.dir && q.amount === p.amount && near(q.postedAt, p.postedAt)) return 'captured';
  }
  const d = new Date(p.postedAt);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const types = p.dir === 'out' ? ['expense', 'transfer', 'ext_out', 'debt_out'] : ['income', 'transfer', 'ext_in', 'debt_in'];
  for (const t of txs) {
    if (t.deletedAt || t.date !== date || t.amount !== p.amount || !types.includes(t.type)) continue;
    if (!t.time) return 'recorded';
    const [h, m] = t.time.split(':').map(Number);
    if (near(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime(), p.postedAt)) return 'recorded';
  }
  return null;
}
