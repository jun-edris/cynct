// Invoice math and the printable page. Amounts in minor units of the invoice's currency.
import { money } from './currency';
import { addDays, todayISO } from './money';

export interface LineItem { desc: string; qty: number; rate: number }
export interface Business { name: string; email: string; phone: string; address: string; tin: string; payment: string }
export const EMPTY_BUSINESS: Business = { name: '', email: '', phone: '', address: '', tin: '', payment: '' };

export function invoiceTotals(items: LineItem[], taxRateBp: number, discount: number) {
  const lines = items.map(i => Math.round((Number.isFinite(i.qty) ? i.qty : 0) * (Number.isFinite(i.rate) ? i.rate : 0)));
  const subtotal = lines.reduce((s, v) => s + v, 0);
  const afterDiscount = Math.max(0, subtotal - Math.max(0, discount));
  const tax = Math.round(afterDiscount * taxRateBp / 10_000);
  return { lines, subtotal, discount: Math.min(Math.max(0, discount), subtotal), tax, total: afterDiscount + tax };
}

/** INV-YYYYMMDD-NNN, counting up from the highest number used today. */
export function nextInvoiceNumber(existing: string[], today = todayISO()): string {
  const prefix = `INV-${today.replace(/-/g, '')}-`;
  const used = existing.filter(n => n.startsWith(prefix)).map(n => parseInt(n.slice(prefix.length), 10)).filter(Number.isFinite);
  return `${prefix}${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0')}`;
}

export const defaultDue = (issue: string, days = 7) => addDays(issue, days);

const esc = (s: string) => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
const nl = (s: string) => esc(s).replace(/\n/g, '<br/>');
const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

export interface InvoiceForPrint {
  number: string; client: string; clientEmail: string; clientAddress: string; issueDate: string; dueDate: string; currency: string;
  items: LineItem[]; taxRate: number; discount: number; notes: string; status: string;
}

export function invoiceHtml(inv: InvoiceForPrint, biz: Business): string {
  const t = invoiceTotals(inv.items, inv.taxRate, inv.discount);
  const m = (v: number) => esc(money(v, inv.currency, { cents: true }));
  const rows = inv.items.map((it, i) => `<tr><td>${nl(it.desc || '—')}</td><td class="r">${it.qty}</td><td class="r">${m(it.rate)}</td><td class="r">${m(t.lines[i])}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
  @page { margin: 36px; }
  body { font-family: -apple-system, Roboto, 'Helvetica Neue', Arial, sans-serif; color: #0B1426; font-size: 12px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 4px solid #FFB020; padding-bottom: 16px; }
  h1 { font-size: 30px; margin: 0; letter-spacing: 1px; }
  .muted { color: #5B6478; }
  .biz { text-align: right; line-height: 1.5; }
  .meta { display: flex; justify-content: space-between; margin: 20px 0; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: left; background: #0B1426; color: #fff; padding: 9px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
  td { padding: 9px 10px; border-bottom: 1px solid #E6E2D8; vertical-align: top; }
  .r { text-align: right; white-space: nowrap; }
  .totals { margin-left: auto; width: 46%; margin-top: 14px; }
  .totals div { display: flex; justify-content: space-between; padding: 5px 0; }
  .grand { border-top: 2px solid #0B1426; font-size: 16px; font-weight: 800; padding-top: 8px !important; }
  .paid { color: #1F9D63; border: 2px solid #1F9D63; padding: 3px 10px; border-radius: 6px; font-weight: 800; display: inline-block; margin-top: 6px; }
  .box { margin-top: 26px; padding: 12px 14px; background: #F7F5EF; border-radius: 8px; line-height: 1.5; }
  </style></head><body>
  <div class="top">
    <div><h1>INVOICE</h1><div class="muted">${esc(inv.number)}</div>${inv.status === 'paid' ? '<div class="paid">PAID</div>' : ''}</div>
    <div class="biz"><b>${esc(biz.name || 'Your business')}</b><br/>${[biz.address && nl(biz.address), biz.email && esc(biz.email), biz.phone && esc(biz.phone), biz.tin && `TIN ${esc(biz.tin)}`].filter(Boolean).join('<br/>')}</div>
  </div>
  <div class="meta">
    <div><div class="muted">Bill to</div><b>${esc(inv.client || '—')}</b>${inv.clientEmail ? `<br/>${esc(inv.clientEmail)}` : ''}${inv.clientAddress ? `<br/>${nl(inv.clientAddress)}` : ''}</div>
    <div style="text-align:right"><div><span class="muted">Issued</span> ${longDate(inv.issueDate)}</div><div><span class="muted">Due</span> <b>${longDate(inv.dueDate)}</b></div><div><span class="muted">Currency</span> ${esc(inv.currency)}</div></div>
  </div>
  <table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="totals">
    <div><span>Subtotal</span><span>${m(t.subtotal)}</span></div>
    ${t.discount ? `<div><span>Discount</span><span>−${m(t.discount)}</span></div>` : ''}
    ${inv.taxRate ? `<div><span>Tax (${inv.taxRate / 100}%)</span><span>${m(t.tax)}</span></div>` : ''}
    <div class="grand"><span>Total due</span><span>${m(t.total)}</span></div>
  </div>
  ${biz.payment ? `<div class="box"><b>How to pay</b><br/>${nl(biz.payment)}</div>` : ''}
  ${inv.notes ? `<div class="box">${nl(inv.notes)}</div>` : ''}
  </body></html>`;
}
