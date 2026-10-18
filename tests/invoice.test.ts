import { describe, expect, it } from 'vitest';
import { EMPTY_BUSINESS, invoiceHtml, invoiceTotals, nextInvoiceNumber } from '../src/lib/invoice';

describe('invoices', () => {
  it('adds up lines, discount and tax', () => {
    const t = invoiceTotals([{ desc: 'Design', qty: 2, rate: 150_000 }, { desc: 'Hosting', qty: 1.5, rate: 10_001 }], 1200, 20_000);
    expect(t.lines).toEqual([300_000, 15_002]);
    expect(t.subtotal).toBe(315_002);
    expect(t.tax).toBe(Math.round(295_002 * 0.12));
    expect(t.total).toBe(295_002 + Math.round(295_002 * 0.12));
    expect(invoiceTotals([{ desc: '', qty: 1, rate: 100 }], 0, 999).total).toBe(0);
  });
  it('numbers invoices per day', () => {
    expect(nextInvoiceNumber([], '2026-10-18')).toBe('INV-20261018-001');
    expect(nextInvoiceNumber(['INV-20261018-001', 'INV-20261018-007', 'INV-20261017-099'], '2026-10-18')).toBe('INV-20261018-008');
  });
  it('escapes what people type into the PDF', () => {
    const html = invoiceHtml({ number: 'INV-1', client: '<b>Acme</b> & Co', clientEmail: '', clientAddress: '', issueDate: '2026-10-18', dueDate: '2026-10-25',
      currency: 'USD', items: [{ desc: 'Work', qty: 1, rate: 50_000 }], taxRate: 0, discount: 0, notes: '', status: 'paid' }, EMPTY_BUSINESS);
    expect(html).toContain('&lt;b&gt;Acme&lt;/b&gt; &amp; Co');
    expect(html).toContain('$500.00');
    expect(html).toContain('PAID');
  });
});

import { hasSqlite, testDb, rawAtVersion, finishMigration } from './helpers';
import { exportAll, importAll, loadAll, upsert } from '../src/db/repo';

describe.skipIf(!hasSqlite)('invoices in the database', () => {
  it('upgrades a v3 database and keeps invoices through a backup', () => {
    const db = finishMigration(rawAtVersion(3));
    upsert.invoice(db, { id: 'i1', number: 'INV-1', client: 'Acme', clientEmail: '', clientAddress: '', issueDate: '2026-10-18', dueDate: '2026-10-25',
      currency: 'USD', items: JSON.stringify([{ desc: 'Work', qty: 1, rate: 50_000 }]), taxRate: 0, discount: 0, notes: '', status: 'sent', paidOn: null, createdAt: 1, updatedAt: 1 });
    const fresh = testDb();
    importAll(fresh.db, JSON.parse(JSON.stringify(exportAll(db))));
    expect(loadAll(fresh.db).invoices[0]).toMatchObject({ number: 'INV-1', currency: 'USD', status: 'sent' });
    expect(() => upsert.invoice(fresh.db, { ...loadAll(fresh.db).invoices[0], status: 'lost' })).toThrow();
  });
});
