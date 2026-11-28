import { describe, expect, it } from 'vitest';
import { buildDrafts, parseCapture, splitParty } from '../src/lib/capture';
import { alreadyKnown, parseMayaScreen, screenToCapture } from '../src/lib/screenshot';

// OCR output of real Maya screenshots (Nov 2026), as messy as it really comes back: "₱" read as "P",
// the logo as stray letters, values split from their labels and out of order.
const SHOTS = {
  neomoney: ['- P3,171.67', 'Neomoney INC', 'vy Completed', 'Reference ID', 'Payment ID', 'Purchased on', 'a', 'Nov 26, 2026, 07:56 AM', 'e Share', 'maya', 'Get help', '9D9D 7ESD FF20', '3D6E A62B D804', '72'],
  investa: ['Purchased on', '- P1,500.00 mM', 'MMA INVESTA @', 'vy Completed Nov 26, 2026, 07:41 AM', 'e Share', 'Reference ID EF4D 7580 DFDC', 'Payment ID 52BD 0C24 9B8E', 'maya', 'Get help'],
  dragonfi: ['- P807.37', 'DRAGONFI', 'vy Completed', 'Reference ID', 'Payment ID', 'Purchased on', 'a', 'Nov 26, 2026, 07:37 AM', 'e Share', 'maya', 'Get help', '7830 47A1 728A', 'E32B 1CFD EE97', '74'],
  sent: ['m', 'Sent money to', '- P385.00 mM', '+639672589889 @', 'vy Completed Nov 26, 2026, 03:23 AM', 'e Share', '- from JUNAIRE EDRIS', 'Reference ID 7699 F4E7 8292', 'maya', 'Get help', '75'],
  // What ML Kit gives after rows are rebuilt from positions: cleaner, ₱ intact.
  mlkit: ['Purchased on  X', '- ₱200.37  m', 'DRAGONFI', 'Completed  Nov 26, 2026, 07:36 AM', 'Share', 'Reference ID  19EE 941C 93AB', 'Payment ID  3C99 D21B 7237', 'maya', 'Get help'],
};
const at = (h: number, m: number) => new Date(2026, 10, 26, h, m).getTime();

describe('Maya screenshots', () => {
  it('reads purchases, whatever order OCR returns the lines in', () => {
    expect(parseMayaScreen(SHOTS.neomoney)).toMatchObject({ kind: 'purchase', dir: 'out', amount: 317_167, party: 'Neomoney INC', postedAt: at(7, 56), ref: '9D9D 7ESD FF20' });
    expect(parseMayaScreen(SHOTS.investa)).toMatchObject({ kind: 'purchase', amount: 150_000, party: 'MMA INVESTA', postedAt: at(7, 41), ref: 'EF4D 7580 DFDC' });
    expect(parseMayaScreen(SHOTS.dragonfi)).toMatchObject({ amount: 80_737, party: 'DRAGONFI', postedAt: at(7, 37) });
    expect(parseMayaScreen(SHOTS.mlkit)).toMatchObject({ amount: 20_037, party: 'DRAGONFI', postedAt: at(7, 36), ref: '19EE 941C 93AB' });
  });

  it('reads a card purchase that is still processing (Booking.com hold)', () => {
    const ml = ['Approved Purchase on  X', '- ₱3,364.48  m', 'BKG*Hotel at Booking.c', 'Processing  Nov 28, 2026, 08:24 AM',
      'The reserved authorization amount may differ from the final', 'amount once successfully settled with the merchant.', 'Share', 'Reference ID  6332 0080 8607', 'maya', 'Get help'];
    const messy = ['The reserved authorization amount may differ from the final', '- P3,364.48 mM', 'Approved Purchase on', 'BKG*Hotel at Booking.c @', 'Processing', 'Nov 28, 2026, 08:24 AM', 'e Share', 'Reference ID', '6332 0080 8607', 'maya', 'Get help'];
    for (const lines of [ml, messy]) {
      expect(parseMayaScreen(lines)).toMatchObject({ kind: 'purchase', dir: 'out', amount: 336_448, party: 'BKG*Hotel at Booking.c', postedAt: new Date(2026, 10, 28, 8, 24).getTime(), ref: '6332 0080 8607' });
    }
    expect(parseCapture(screenToCapture(parseMayaScreen(ml)!))).toMatchObject({ dir: 'out', amount: 336_448 });
  });

  it('reads money sent to a number, with its message', () => {
    expect(parseMayaScreen(SHOTS.sent)).toMatchObject({ kind: 'send', dir: 'out', amount: 38_500, party: '+639672589889', message: 'from JUNAIRE EDRIS', postedAt: at(3, 23) });
  });

  it('ignores screens that are not finished Maya payments', () => {
    expect(parseMayaScreen(['GCash', 'Sent via GCash', '₱500.00'])).toBeNull();
    expect(parseMayaScreen([...SHOTS.investa.filter(l => !/Completed/.test(l)), 'Failed'])).toBeNull();
  });

  it('turns a screenshot into a capture the existing rules read', () => {
    const row = screenToCapture(parseMayaScreen(SHOTS.neomoney)!);
    expect(row).toMatchObject({ id: 'shot:maya:9D9D7ESDFF20', app: 'maya', text: 'You paid ₱3,171.67 at Neomoney INC.', postedAt: at(7, 56) });
    expect(parseCapture(row)).toMatchObject({ dir: 'out', amount: 317_167, who: 'Neomoney INC' });
    const sent = parseCapture(screenToCapture(parseMayaScreen(SHOTS.sent)!));
    expect(sent).toMatchObject({ dir: 'out', amount: 38_500, who: '+639672589889', tail: '9889' });
  });

  it('a number you marked as yours makes the send a transfer', () => {
    const p = parseCapture(screenToCapture(parseMayaScreen(SHOTS.sent)!))!;
    expect(buildDrafts([p], { names: [], tails: ['9889'] })[0].kind).toBe('transfer');
    expect(buildDrafts([p], { names: [], tails: [] })[0].kind).toBe('expense');
    expect(splitParty('+63 967 258 9889')).toEqual({ who: '+63 967 258 9889', via: null, tail: '9889' });
  });

  it('skips a screenshot that would double a notification or a saved entry', () => {
    const p = parseCapture(screenToCapture(parseMayaScreen(SHOTS.neomoney)!))!;
    const notif = { id: 'n1', app: 'maya', title: 'Payment successful 👍', text: 'You paid ₱3,171.67 at PMP Neomoney INC.', postedAt: at(7, 57) };
    expect(alreadyKnown(p, [notif], [])).toBe('captured');
    expect(alreadyKnown(p, [], [{ type: 'expense', amount: 317_167, date: '2026-11-26', time: '07:55' }])).toBe('recorded');
    expect(alreadyKnown(p, [], [{ type: 'expense', amount: 317_167, date: '2026-11-26', time: '13:00' }])).toBeNull();
    expect(alreadyKnown(p, [{ ...notif, postedAt: at(9, 0) }], [])).toBeNull();
  });
});
