import { describe, expect, it } from 'vitest';
import { amountsIn, findDate, parseReceipt } from '../src/lib/receipt';

const today = '2026-10-18';

describe('receipt parser', () => {
  it('reads amounts with thousands separators and peso signs', () => {
    expect(amountsIn('TOTAL ₱1,234.50')).toEqual([123450]);
    expect(amountsIn('2 x 45.00   90.00')).toEqual([4500, 9000]);
    expect(amountsIn('TIN 123-456-789-000')).toEqual([]);
  });

  it('picks amount due over subtotal, VAT, cash and change', () => {
    const g = parseReceipt([
      'JOLLIBEE TAGBILARAN\nCPG Ave, Tagbilaran City\nVAT REG TIN 000-123-456-000',
      'OFFICIAL RECEIPT\n10/17/2026 12:41 PM',
      '1 Chickenjoy 1pc 99.00\n1 Yumburger 45.00\n1 Coke Float 69.00',
      'SUBTOTAL 213.00\nVATable Sales 190.18\nVAT Amount 22.82\nTOTAL AMOUNT DUE 213.00\nCASH 500.00\nCHANGE 287.00',
    ], today);
    expect(g.total).toBe(21300);
    expect(g.date).toBe('2026-10-17');
    expect(g.merchant).toBe('Jollibee Tagbilaran');
    expect(g.amounts[0]).toBe(50000);
  });

  it('handles the label and number split into separate lines', () => {
    const g = parseReceipt(['ALTURAS SUPERMARKET', 'TOTAL', '1,486.75', 'CASH', '2,000.00', 'CHANGE', '513.25'], today);
    expect(g.total).toBe(148675);
  });

  it('falls back to cash minus change when no total label was read', () => {
    const g = parseReceipt(['Sari-sari Store', 'Rice 5kg 280.00', 'Eggs 120.00', '400.00', 'CASH 1,000.00', 'CHANGE 600.00'], today);
    expect(g.total).toBe(40000);
  });

  it('reads common date formats and ignores impossible or future ones', () => {
    expect(findDate('Date: 2026-10-01', today)).toBe('2026-10-01');
    expect(findDate('Oct 5, 2026 3:12PM', today)).toBe('2026-10-05');
    expect(findDate('05 Sep 2026', today)).toBe('2026-09-05');
    expect(findDate('10/18/26', today)).toBe('2026-10-18');
    expect(findDate('12/25/2026', today)).toBeNull();
    expect(findDate('SN 99/99/9999', today)).toBeNull();
  });

  it('returns nothing useful for an empty scan without throwing', () => {
    expect(parseReceipt([], today)).toMatchObject({ total: null, date: null, merchant: null, amounts: [] });
  });
});

describe('receipt category guess', () => {
  const cats = [
    { id: 'food.eatout', kind: 'expense', name: 'Eating out', keywords: ['lunch'] },
    { id: 'food.groceries', kind: 'expense', name: 'Groceries', keywords: ['grocery'] },
    { id: 'transport.gas', kind: 'expense', name: 'Gas', keywords: ['gas'] },
    { id: 'salary', kind: 'income', name: 'Salary', keywords: [] },
  ];
  it('uses store names first, then your keywords', async () => {
    const { guessCategory } = await import('../src/lib/receipt');
    expect(guessCategory(parseReceipt(['PETRON TAGBILARAN', 'UNLEADED 3.5L 250.00', 'TOTAL 250.00'], today), cats)).toBe('transport.gas');
    expect(guessCategory(parseReceipt(['ALTURAS SUPERMARKET', 'TOTAL 900.00'], today), cats)).toBe('food.groceries');
    expect(guessCategory(parseReceipt(['Kusina ni Inday', 'lunch set 150.00', 'TOTAL 150.00'], today), cats)).toBe('food.eatout');
    expect(guessCategory(parseReceipt(['Random Store', 'TOTAL 10.00'], today), cats)).toBeNull();
  });
});
