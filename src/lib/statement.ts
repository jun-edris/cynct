// Monthly statement as a printable page: totals, spending by category, money in/out per account, every entry.
import { money } from './currency';
import { peso } from './money';

export interface StatementRow { date: string; description: string; category: string; account: string; amount: string; inflow: boolean }
export interface StatementInput {
  title: string; period: string; generated: string; owner?: string;
  income: number; expense: number; net: number; savingsRate: number | null;
  categories: { name: string; amount: number; share: number }[];
  accounts: { name: string; currency: string; inflow: number; outflow: number; closing: number }[];
  rows: StatementRow[];
}

const esc = (s: string) => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

export function statementHtml(s: StatementInput): string {
  const p = (v: number) => esc(peso(v, { cents: true }));
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
  @page { margin: 32px; }
  body { font-family: -apple-system, Roboto, Arial, sans-serif; color: #0B1426; font-size: 11px; }
  .head { display: flex; justify-content: space-between; border-bottom: 4px solid #FFB020; padding-bottom: 12px; }
  h1 { margin: 0; font-size: 24px; } h2 { font-size: 13px; margin: 22px 0 8px; text-transform: uppercase; letter-spacing: .6px; }
  .muted { color: #5B6478; }
  .tiles { display: flex; gap: 10px; margin-top: 16px; }
  .tile { flex: 1; background: #F7F5EF; border-radius: 8px; padding: 10px 12px; }
  .tile b { display: block; font-size: 16px; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; color: #5B6478; border-bottom: 1.5px solid #0B1426; padding: 6px; }
  td { padding: 6px; border-bottom: 1px solid #E6E2D8; vertical-align: top; }
  .r { text-align: right; white-space: nowrap; } .in { color: #1F9D63; }
  .bar { height: 6px; background: #FFB020; border-radius: 3px; }
  </style></head><body>
  <div class="head"><div><h1>${esc(s.title)}</h1><div class="muted">${esc(s.period)}${s.owner ? ` · ${esc(s.owner)}` : ''}</div></div>
  <div class="muted" style="text-align:right">Cynct<br/>Generated ${esc(s.generated)}</div></div>
  <div class="tiles">
    <div class="tile">Money in<b class="in">${p(s.income)}</b></div>
    <div class="tile">Spent<b>${p(s.expense)}</b></div>
    <div class="tile">Net<b class="${s.net >= 0 ? 'in' : ''}">${s.net >= 0 ? '+' : ''}${p(s.net)}</b></div>
    <div class="tile">Kept<b>${s.savingsRate === null ? '—' : `${Math.round(s.savingsRate * 100)}%`}</b></div>
  </div>
  <h2>Spending by category</h2>
  <table><thead><tr><th>Category</th><th style="width:40%"></th><th class="r">Amount</th><th class="r">Share</th></tr></thead><tbody>
  ${s.categories.map(c => `<tr><td>${esc(c.name)}</td><td><div class="bar" style="width:${Math.max(2, Math.round(c.share * 100))}%"></div></td><td class="r">${p(c.amount)}</td><td class="r">${Math.round(c.share * 100)}%</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No spending this period.</td></tr>'}
  </tbody></table>
  <h2>Accounts</h2>
  <table><thead><tr><th>Account</th><th class="r">In</th><th class="r">Out</th><th class="r">Balance at end</th></tr></thead><tbody>
  ${s.accounts.map(a => `<tr><td>${esc(a.name)}</td><td class="r in">${esc(money(a.inflow, a.currency, { cents: true }))}</td><td class="r">${esc(money(a.outflow, a.currency, { cents: true }))}</td><td class="r"><b>${esc(money(a.closing, a.currency, { cents: true }))}</b></td></tr>`).join('')}
  </tbody></table>
  <h2>Entries (${s.rows.length})</h2>
  <table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Account</th><th class="r">Amount</th></tr></thead><tbody>
  ${s.rows.map(r => `<tr><td>${esc(r.date)}</td><td>${esc(r.description)}</td><td>${esc(r.category)}</td><td>${esc(r.account)}</td><td class="r ${r.inflow ? 'in' : ''}">${esc(r.amount)}</td></tr>`).join('')}
  </tbody></table>
  <p class="muted" style="margin-top:18px">Totals are in pesos; entries show each account's own currency. Transfers between your accounts aren't counted as spending.</p>
  </body></html>`;
}
