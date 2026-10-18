import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useData, safeJson } from '../data/DataContext';
import { useTheme } from '../theme';
import { Block, Button, Card, Chip, Empty, Icon, IconBubble, List, Row, Screen, Section, T } from '../components/ui';
import { invoiceTotals, type Business, type LineItem } from '../lib/invoice';
import { money } from '../lib/currency';
import { dayLabel, todayISO } from '../lib/money';

export default function Invoices() {
  const { c } = useTheme();
  const { data } = useData();
  const biz = data.settings.business as Partial<Business> | undefined;
  const today = todayISO();
  const rows = data.invoices.map(inv => ({ inv, total: invoiceTotals(safeJson<LineItem[]>(inv.items, []), inv.taxRate, inv.discount).total }));
  // Outstanding grouped by currency: you can't add USD and PHP.
  const outstanding = new Map<string, number>();
  for (const r of rows) if (r.inv.status !== 'paid') outstanding.set(r.inv.currency, (outstanding.get(r.inv.currency) ?? 0) + r.total);

  return (
    <Screen title="Invoices" subtitle="Bill a client, export a PDF, and record the payment when it lands." back
      right={<Button small icon="plus" label="New" onPress={() => router.push('/invoice/new')} />}>
      <Card onPress={() => router.push('/business')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconBubble icon="storefront-outline" color={c.mango} />
        <View style={{ flex: 1 }}>
          <T v="semi">{biz?.name || 'Business info'}</T>
          <T v="small">{biz?.name ? [biz.email, biz.phone].filter(Boolean).join(' · ') || 'Sender details' : 'Add your sender details'}</T>
        </View>
        <Icon name="chevron-right" color={c.faint} />
      </Card>

      {outstanding.size ? (
        <Block tone="navy" style={{ marginTop: 12 }}>
          <T v="semi" color={c.navyMuted}>Waiting to be paid</T>
          {[...outstanding].map(([cur, v]) => <T key={cur} v="display" color={c.navyText} style={{ fontSize: 30, lineHeight: 36 }}>{money(v, cur)}</T>)}
        </Block>
      ) : null}

      <Section title="All invoices">
        {rows.length ? <List>{rows.map(({ inv, total }) => {
          const overdue = inv.status !== 'paid' && inv.dueDate < today;
          return (
            <Row key={inv.id} onPress={() => router.push(`/invoice/${inv.id}`)}
              left={<IconBubble icon={inv.status === 'paid' ? 'check-decagram' : 'file-document-outline'} color={inv.status === 'paid' ? c.income : overdue ? c.spend : c.info} />}
              title={inv.client || inv.number}
              sub={<View style={{ flexDirection: 'row', gap: 6, marginTop: 3, alignItems: 'center' }}>
                <Chip label={inv.status === 'paid' ? 'Paid' : overdue ? 'Overdue' : inv.status === 'sent' ? 'Sent' : 'Draft'} tone={inv.status === 'paid' ? 'good' : overdue ? 'bad' : 'plain'} />
                <T v="small">{inv.status === 'paid' ? inv.number : `Due ${dayLabel(inv.dueDate)}`}</T>
              </View>}
              right={<T v="num">{money(total, inv.currency)}</T>} />
          );
        })}</List> : <Empty icon="file-document-outline" title="No invoices yet" text="Make one for a client in a minute and send it as a PDF." action="New invoice" onAction={() => router.push('/invoice/new')} />}
      </Section>
    </Screen>
  );
}
