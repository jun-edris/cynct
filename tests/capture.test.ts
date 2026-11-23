import { describe, expect, it } from 'vitest';
import { accountFor, appOf, buildDrafts, isMe, parseAmount, parseCapture, splitParty, type CaptureRow } from '../src/lib/capture';

// Real notifications from the user's phone (Oct–Nov 2026).
const T0 = Date.UTC(2026, 9, 25, 8, 56);
const min = 60_000;
const row = (id: string, app: string, title: string, text: string, at = T0): CaptureRow => ({ id, app, title, text, postedAt: at });
const REAL = {
  wisePaid: row('w1', 'wise', 'You just got paid', 'Dale Edwin Johnson Jr. sent you 55 USD. It\'s in your account, ready to use.', T0 + 340 * min),
  wiseOut: row('w2', 'wise', 'That was fast', 'Your transfer of 1,700 PHP is now in your account.', T0),
  gotymeIn: row('g1', 'gotyme', 'Transfer received', 'You received ₱1,700.00 from J. E. B. Buico.', T0),
  gotymeOut: row('g2', 'gotyme', 'Transfer successful', 'You sent P1500.00 to Rogelio Bocboc G-Xchange, Inc (GCash) 0••••3797.', T0 + min),
  mayaOut: row('m1', 'maya', 'Money transferred ↗️', 'Success! You transferred ₱467.00 to G-Xchange Inc. / GCash.', T0 + 1000 * min),
  mayaPaid: row('m2', 'maya', 'Payment successful 👍', 'You paid ₱9,000.00 at PMP Neomoney INC.', T0 + 2000 * min),
  mayaIn: row('m3', 'maya', 'Money received ↙️', 'You received 10,000.00 in your wallet via InstaPay', T0 + 2001 * min),
  mayaCard: row('m4', 'maya', "We're preparing your Maya card!", "Success! We're now preparing your card for delivery. Expect it in 4 working days in Metro Manila and 8–10 elsewhere.", T0),
};

describe('reading notifications', () => {
  it('reads amounts in every format the apps use', () => {
    expect(parseAmount('₱1,700.00')).toEqual({ amount: 170_000, currency: 'PHP' });
    expect(parseAmount('P1500.00')).toEqual({ amount: 150_000, currency: 'PHP' });
    expect(parseAmount('55 USD')).toEqual({ amount: 5_500, currency: 'USD' });
    expect(parseAmount('2,500 PHP')).toEqual({ amount: 250_000, currency: 'PHP' });
    expect(parseAmount('10,000.00')).toEqual({ amount: 1_000_000, currency: 'PHP' });
    expect(parseAmount('0')).toBeNull();
  });

  it('splits the other side into person, channel and account digits', () => {
    expect(splitParty('Rogelio Bocboc G-Xchange, Inc (GCash) 0••••3797.')).toEqual({ who: 'Rogelio Bocboc', via: 'GCash', tail: '3797' });
    expect(splitParty('G-Xchange Inc. / GCash.')).toEqual({ who: 'GCash', via: 'GCash', tail: null });
  });

  it('understands Wise, GoTyme and Maya', () => {
    expect(parseCapture(REAL.wisePaid)).toMatchObject({ dir: 'in', amount: 5_500, currency: 'USD', who: 'Dale Edwin Johnson Jr' });
    expect(parseCapture(REAL.wiseOut)).toMatchObject({ dir: 'out', amount: 170_000, currency: 'PHP', toSelf: true });
    expect(parseCapture(REAL.gotymeIn)).toMatchObject({ dir: 'in', amount: 170_000, who: 'J. E. B. Buico' });
    expect(parseCapture(REAL.gotymeOut)).toMatchObject({ dir: 'out', amount: 150_000, who: 'Rogelio Bocboc', via: 'GCash', tail: '3797' });
    expect(parseCapture(REAL.mayaOut)).toMatchObject({ dir: 'out', amount: 46_700, via: 'GCash' });
    expect(parseCapture(REAL.mayaPaid)).toMatchObject({ dir: 'out', amount: 900_000, who: 'PMP Neomoney INC' });
    expect(parseCapture(REAL.mayaIn)).toMatchObject({ dir: 'in', amount: 1_000_000, who: null, via: 'InstaPay' });
    expect(parseCapture(REAL.mayaCard)).toBeNull();
  });

  it('knows the apps by package or visible name', () => {
    expect(appOf('com.paymaya', 'Maya')).toBe('maya');
    expect(appOf('ph.something.gotyme', 'GoTyme PH')).toBe('gotyme');
    expect(appOf('com.facebook.orca', 'Messenger')).toBeNull();
  });

  it('recognises your own name written with initials', () => {
    expect(isMe('J. E. B. Buico', ['Juned E. B. Buico'])).toBe(true);
    expect(isMe('J. E. B. Buico', ['JEB Buico'])).toBe(true);
    expect(isMe('J. E. B. Buico', ['J E B Buico'])).toBe(true);
    expect(isMe('Rogelio Bocboc', ['Juned E. B. Buico'])).toBe(false);
  });
});

describe('drafts', () => {
  const parsed = (rs: CaptureRow[]) => rs.map(parseCapture).filter(Boolean) as NonNullable<ReturnType<typeof parseCapture>>[];

  it('turns Wise → GoTyme into one transfer, not income plus expense', () => {
    const d = buildDrafts(parsed([REAL.wiseOut, REAL.gotymeIn, REAL.gotymeOut, REAL.wisePaid]), { names: ['Juned E. B. Buico'], tails: [] });
    const transfer = d.find(x => x.kind === 'transfer')!;
    expect(transfer).toMatchObject({ fromApp: 'wise', toApp: 'gotyme', amount: 170_000, currency: 'PHP', ids: ['w2', 'g1'] });
    expect(d.filter(x => x.kind === 'income')).toHaveLength(1); // only Dale's $55
    expect(d.find(x => x.kind === 'income')).toMatchObject({ amount: 5_500, currency: 'USD', app: 'wise', note: 'From Dale Edwin Johnson Jr' });
    expect(d.find(x => x.kind === 'expense')).toMatchObject({ amount: 150_000, app: 'gotyme', who: 'Rogelio Bocboc' });
  });

  it('does not pair amounts that are too far apart in time', () => {
    const late = { ...REAL.gotymeIn, postedAt: T0 + 3 * 60 * min };
    const d = buildDrafts(parsed([REAL.wiseOut, late]), { names: [], tails: [] });
    expect(d.map(x => x.kind).sort()).toEqual(['income', 'transfer']);
    expect(d.find(x => x.kind === 'transfer')).toMatchObject({ fromApp: 'wise', toApp: null, check: 'Pick the account it went to.' });
  });

  it('treats money to your own GCash number as a transfer', () => {
    const d = buildDrafts(parsed([REAL.gotymeOut]), { names: [], tails: ['3797'] });
    expect(d[0]).toMatchObject({ kind: 'transfer', fromApp: 'gotyme', toApp: null });
  });

  it('flags Maya InstaPay money with no sender so you can check it', () => {
    const d = buildDrafts(parsed([REAL.mayaIn, REAL.mayaPaid]), { names: [], tails: [] });
    expect(d.find(x => x.kind === 'income')!.check).toMatch(/No sender/);
    expect(d.find(x => x.kind === 'expense')).toMatchObject({ amount: 900_000, note: 'PMP Neomoney INC' });
  });

  it('picks the linked account in the right currency', () => {
    const accounts = [
      { id: 'wise-php', name: 'Wise PHP', currency: 'PHP', archived: false },
      { id: 'wise-usd', name: 'Wise USD', currency: 'USD', archived: false },
      { id: 'maya', name: 'Maya', currency: 'PHP', archived: false },
    ];
    expect(accountFor('wise', 'USD', {}, accounts)).toBe('wise-usd');
    expect(accountFor('wise', 'PHP', {}, accounts)).toBe('wise-php');
    expect(accountFor('maya', 'PHP', { maya: ['maya'] }, accounts)).toBe('maya');
    expect(accountFor('gotyme', 'PHP', {}, accounts)).toBeNull();
  });
});
