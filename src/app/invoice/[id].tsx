import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useData, safeJson } from '../../data/DataContext';
import { useTheme } from '../../theme';
import { Block, Button, Card, Chip, DateField, Field, Footer, FormRow, IconButton, Screen, Section, Select, Sheet, T, close } from '../../components/ui';
import { remove, upsert } from '../../db/repo';
import { CURRENCIES, money } from '../../lib/currency';
import { EMPTY_BUSINESS, defaultDue, invoiceHtml, invoiceTotals, nextInvoiceNumber, type Business, type LineItem } from '../../lib/invoice';
import { sharePdf } from '../../lib/pdf';
import { daysBetween, inputValue, nowMs, toCentavos, todayISO, uid } from '../../lib/money';
import type { Invoice } from '../../db/schema';

interface ItemDraft { desc: string; qty: string; rate: string }

export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { data, act, toast } = useData();
  // A stable id from the start, so exporting a new invoice and then saving doesn't create two.
  const [rid] = useState(() => (id && id !== 'new' ? id : uid()));
  const inv = data.invoices.find(x => x.id === rid);
  const today = todayISO();
  const last = data.invoices[0];
  const [number, setNumber] = useState(inv?.number ?? nextInvoiceNumber(data.invoices.map(x => x.number), today));
  const [client, setClient] = useState(inv?.client ?? '');
  const [clientEmail, setClientEmail] = useState(inv?.clientEmail ?? '');
  const [clientAddress, setClientAddress] = useState(inv?.clientAddress ?? '');
  const [issueDate, setIssue] = useState(inv?.issueDate ?? today);
  const [dueDate, setDue] = useState(inv?.dueDate ?? defaultDue(today));
  const [currency, setCurrency] = useState(inv?.currency ?? last?.currency ?? 'PHP');
  const [items, setItems] = useState<ItemDraft[]>(() => {
    const saved = safeJson<LineItem[]>(inv?.items, []);
    return saved.length ? saved.map(i => ({ desc: i.desc, qty: String(i.qty), rate: inputValue(i.rate) })) : [{ desc: '', qty: '1', rate: '' }];
  });
  const [tax, setTax] = useState(inv?.taxRate ? String(inv.taxRate / 100) : '');
  const [discount, setDiscount] = useState(inputValue(inv?.discount));
  const [notes, setNotes] = useState(inv?.notes ?? '');
  const [status, setStatus] = useState(inv?.status ?? 'draft');
  const [paidSheet, setPaidSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  const lineItems: LineItem[] = items.map(i => ({ desc: i.desc.trim(), qty: Number(i.qty.replace(/,/g, '')) || 0, rate: toCentavos(i.rate || '0') || 0 }));
  const taxBp = Math.round((Number(tax) || 0) * 100);
  const disc = toCentavos(discount || '0') || 0;
  const t = invoiceTotals(lineItems, taxBp, disc);
  const m = (v: number) => money(v, currency, { cents: true });
  const dueIn = daysBetween(today, dueDate);
  const biz = { ...EMPTY_BUSINESS, ...((data.settings.business as Partial<Business>) ?? {}) };

  const row = (patch: Partial<Invoice> = {}): Invoice => ({
    id: rid, number: number.trim() || nextInvoiceNumber(data.invoices.map(x => x.number), today), client: client.trim(), clientEmail: clientEmail.trim(),
    clientAddress: clientAddress.trim(), issueDate, dueDate, currency, items: JSON.stringify(lineItems.filter(i => i.desc || i.rate)), taxRate: taxBp, discount: disc,
    notes: notes.trim(), status, paidOn: inv?.paidOn ?? null, createdAt: inv?.createdAt ?? nowMs(), updatedAt: nowMs(), ...patch,
  });

  const save = (patch: Partial<Invoice> = {}, msg = 'Invoice saved') => {
    if (dueDate < issueDate) { toast('The due date is before the issue date.'); return null; }
    const r = row(patch);
    return act(db => upsert.invoice(db, r), msg) ? r : null;
  };

  const exportPdf = async () => {
    if (!t.total) { toast('Add at least one item with a rate.'); return; }
    const r = save(status === 'draft' ? { status: 'sent' } : {}, '');
    if (!r) return;
    if (status === 'draft') setStatus('sent');
    setBusy(true);
    try { await sharePdf(invoiceHtml({ ...r, items: lineItems }, biz), `${r.number}${r.client ? `-${r.client}` : ''}`, 'Send invoice'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Couldn’t make the PDF.'); }
    finally { setBusy(false); }
  };

  const markPaid = (record: boolean) => {
    const r = save({ status: 'paid', paidOn: today }, 'Marked paid');
    setPaidSheet(false);
    if (!r) return;
    setStatus('paid');
    if (record) {
      // Pick the account it landed in on the next screen; the amount is in the invoice's currency.
      const acct = data.accounts.find(a => !a.archived && a.currency === currency);
      router.push({ pathname: '/tx/[id]', params: { id: 'new', type: 'income', amount: String(t.total / 100), note: `${r.client || 'Client'} · ${r.number}`, category: 'freelance', account: acct?.id ?? '' } });
    }
  };

  const setItem = (i: number, patch: Partial<ItemDraft>) => setItems(list => list.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  return (
    <>
      <Screen title={id !== 'new' ? number : 'New invoice'} back padBottom={30}
        right={inv ? <IconButton name="trash-can-outline" label="Delete invoice" filled color={c.spend} onPress={() => { if (act(db => remove.invoice(db, inv.id), 'Invoice deleted')) close(); }} /> : undefined}>
        <Block tone="navy">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T v="semi" color={c.navyMuted}>Total due</T>
            <Chip label={status === 'paid' ? 'Paid' : dueIn < 0 ? `Overdue ${-dueIn}d` : dueIn === 0 ? 'Due today' : `Due in ${dueIn} days`} tone={status === 'paid' ? 'good' : dueIn < 0 ? 'bad' : 'plain'} />
          </View>
          <T v="display" color={c.navyText}>{m(t.total)}</T>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Button icon="file-pdf-box" label={busy ? 'Making PDF…' : 'Export PDF'} onPress={exportPdf} disabled={busy} style={{ flex: 1 }} />
            {status !== 'paid' ? <Button variant="secondary" icon="check" label="Paid" onPress={() => setPaidSheet(true)} /> : null}
          </View>
        </Block>

        {!biz.name ? (
          <Card style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.warnSoft }} onPress={() => router.push('/business')}>
            <T v="medium" style={{ flex: 1 }}>Add your business info so the invoice shows who it’s from.</T>
          </Card>
        ) : null}

        <Section title="Details">
          <View style={{ gap: 14 }}>
            <Field label="Invoice number" value={number} onChangeText={setNumber} autoCapitalize="characters" />
            <Field label="Client name" value={client} onChangeText={setClient} placeholder="e.g. Acme Studio" />
            <Field label="Client email" value={clientEmail} onChangeText={setClientEmail} placeholder="billing@client.com" autoCapitalize="none" keyboardType="email-address" />
            <Field label="Client address" value={clientAddress} onChangeText={setClientAddress} placeholder="Optional" multiline />
            <FormRow>
              <View style={{ flex: 1 }}><DateField label="Issued" value={issueDate} onChange={(v) => v && setIssue(v)} /></View>
              <View style={{ flex: 1 }}><DateField label="Due" value={dueDate} onChange={(v) => v && setDue(v)} /></View>
            </FormRow>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[7, 15, 30].map(d => <Chip key={d} label={`Net ${d}`} selected={dueDate === defaultDue(issueDate, d)} onPress={() => setDue(defaultDue(issueDate, d))} />)}
            </View>
            <Select label="Currency" value={currency} onChange={setCurrency} options={CURRENCIES.map(x => ({ value: x.code, label: `${x.code} · ${x.name}` }))} />
          </View>
        </Section>

        <Section title="Items" action="Add item" onAction={() => setItems(list => [...list, { desc: '', qty: '1', rate: '' }])}>
          <View style={{ gap: 12 }}>
            {items.map((it, i) => (
              <Card key={i} style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <T v="semi">Item {i + 1}</T>
                  {items.length > 1 ? <IconButton name="close" label={`Remove item ${i + 1}`} size={36} onPress={() => setItems(list => list.filter((_, k) => k !== i))} /> : null}
                </View>
                <Field label="Description" value={it.desc} onChangeText={v => setItem(i, { desc: v })} placeholder="e.g. Website design" multiline />
                <FormRow>
                  <View style={{ flex: 1 }}><Field label="Qty" value={it.qty} onChangeText={v => setItem(i, { qty: v })} keyboardType="decimal-pad" /></View>
                  <View style={{ flex: 2 }}><Field label="Rate" value={it.rate} onChangeText={v => setItem(i, { rate: v })} keyboardType="decimal-pad" placeholder="0" /></View>
                </FormRow>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T v="medium" color={c.muted}>Line total</T><T v="num">{m(t.lines[i] ?? 0)}</T>
                </View>
              </Card>
            ))}
          </View>
        </Section>

        <Section title="Totals">
          <Card style={{ gap: 12 }}>
            <FormRow>
              <View style={{ flex: 1 }}><Field label="Discount" value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" placeholder="0" /></View>
              <View style={{ flex: 1 }}><Field label="Tax %" value={tax} onChangeText={setTax} keyboardType="decimal-pad" placeholder="0" hint="e.g. 12 for VAT" /></View>
            </FormRow>
            {[['Subtotal', t.subtotal], ['Discount', -t.discount], ['Tax', t.tax]].filter(([, v]) => v).map(([l, v]) => (
              <View key={l as string} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T v="medium" color={c.muted}>{l}</T><T v="semi">{m(v as number)}</T></View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T v="semi">Total due</T><T v="num">{m(t.total)}</T></View>
          </Card>
        </Section>

        <Section title="Notes">
          <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Payment terms, thank-you note, or bank details" multiline />
        </Section>
      </Screen>
      <Footer><Button label="Save invoice" icon="check" style={{ flex: 1 }} onPress={() => { if (save()) router.back(); }} /></Footer>

      <Sheet visible={paidSheet} onClose={() => setPaidSheet(false)} title="Mark as paid">
        <View style={{ gap: 12 }}>
          <T v="muted">{`Record ${m(t.total)} as income now? You’ll pick the account it landed in. If it arrived converted (e.g. USD into pesos), change the amount there.`}</T>
          <Button icon="cash-plus" label="Mark paid and record income" onPress={() => markPaid(true)} />
          <Button variant="secondary" label="Just mark paid" onPress={() => markPaid(false)} />
        </View>
      </Sheet>
    </>
  );
}
