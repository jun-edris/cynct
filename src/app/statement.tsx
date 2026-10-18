import React, { useState } from 'react';
import { View } from 'react-native';
import { useData } from '../data/DataContext';
import { useTheme } from '../theme';
import { Button, Card, IconButton, List, Row, Screen, Section, StatTile, T } from '../components/ui';
import { useTxLook } from '../components/domain';
import { summarize, txDeltas, FEES_CATEGORY } from '../lib/ledger';
import { rootName } from '../lib/recap';
import { statementHtml } from '../lib/statement';
import { sharePdf } from '../lib/pdf';
import { addMonths, compactPeso, lastDayOfMonth, monthLabel, peso, todayISO } from '../lib/money';
import { money } from '../lib/currency';
import type { Business } from '../lib/invoice';

const INFLOW = new Set(['income', 'debt_in', 'ext_in', 'goal_out']);

export default function Statement() {
  const { c } = useTheme();
  const { data, rtx, cats, toast } = useData();
  const look = useTxLook();
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [busy, setBusy] = useState(false);
  const start = `${month}-01`, end = lastDayOfMonth(start);
  const s = summarize(rtx, start, end, cats);
  const categories = [...s.byRoot.entries()].sort((a, b) => b[1] - a[1])
    .map(([id, amount]) => ({ name: id === FEES_CATEGORY ? 'Fees' : rootName(id, data.categories), amount, share: s.expense ? amount / s.expense : 0 }));

  // Per account, in its own currency: what came in and went out this month, and the balance at month end.
  const inRange = data.transactions.filter(t => t.date >= start && t.date <= end);
  const accounts = data.accounts.filter(a => !a.archived || inRange.some(t => t.accountId === a.id || t.toAccountId === a.id)).map(a => {
    let inflow = 0, outflow = 0, closing = a.opening;
    for (const t of data.transactions) {
      if (t.date > end) continue;
      for (const [id, v] of txDeltas(t)) {
        if (id !== a.id) continue;
        closing += v;
        if (t.date >= start) { if (v > 0) inflow += v; else outflow -= v; }
      }
    }
    return { name: a.name, currency: a.currency, inflow, outflow, closing };
  });
  const rows = [...inRange].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')).map(t => {
    const l = look(t);
    const cat = t.categoryId ? data.categories.find(x => x.id === t.categoryId)?.name ?? '' : '';
    const acc = [t.accountId, t.toAccountId].map(id => data.accounts.find(a => a.id === id)?.name).filter(Boolean).join(' → ');
    return { date: t.date, description: l.title, category: cat, account: acc, amount: l.amount, inflow: INFLOW.has(t.type) || (t.type === 'adjust' && t.amount > 0) };
  });
  const savingsRate = s.income > 0 ? (s.income - s.expense) / s.income : null;
  const label = monthLabel(month);

  const exportPdf = async () => {
    setBusy(true);
    try {
      const biz = data.settings.business as Partial<Business> | undefined;
      const html = statementHtml({ title: 'Monthly statement', period: label, generated: new Date().toLocaleDateString('en-PH', { dateStyle: 'medium' }), owner: biz?.name,
        income: s.income, expense: s.expense, net: s.net, savingsRate, categories, accounts, rows });
      await sharePdf(html, `Cynct-statement-${month}`, 'Share statement');
    } catch (e) { toast(e instanceof Error ? e.message : 'Couldn’t make the PDF.'); }
    finally { setBusy(false); }
  };

  return (
    <Screen title="Statement" subtitle="A PDF summary of a month: totals, categories, accounts and every entry." back>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton name="chevron-left" label="Previous month" filled onPress={() => setMonth(addMonths(start, -1).slice(0, 7))} />
        <T v="h2">{label}</T>
        <IconButton name="chevron-right" label="Next month" filled onPress={() => setMonth(addMonths(start, 1).slice(0, 7))} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <StatTile label="Money in" value={compactPeso(s.income)} color={c.income} />
        <StatTile label="Spent" value={compactPeso(s.expense)} color={c.spend} />
        <StatTile label="Kept" value={savingsRate === null ? '—' : `${Math.round(savingsRate * 100)}%`} />
      </View>
      <Button icon="file-pdf-box" label={busy ? 'Making PDF…' : 'Export PDF'} style={{ marginTop: 14 }} onPress={exportPdf} disabled={busy} />
      <Section title="By category">
        {categories.length ? <List>{categories.slice(0, 8).map(x => <Row key={x.name} title={x.name} sub={`${Math.round(x.share * 100)}%`} right={<T v="num">{peso(x.amount, { cents: false })}</T>} />)}</List>
          : <T v="muted">No spending this month.</T>}
      </Section>
      <Section title="Accounts">
        <Card style={{ gap: 8 }}>
          {accounts.map(a => (
            <View key={a.name} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T v="medium">{a.name}</T><T v="semi">{money(a.closing, a.currency, { cents: false })}</T>
            </View>
          ))}
        </Card>
      </Section>
      <T v="small" style={{ marginTop: 12 }}>{`${rows.length} entries will be listed in the PDF.`}</T>
    </Screen>
  );
}
