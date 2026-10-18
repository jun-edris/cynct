import React from 'react';
import { Image, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { useData } from '../data/DataContext';
import { radius, useTheme } from '../theme';
import { Button, Card, Empty, Icon, IconBubble, IconButton, Screen, T } from '../components/ui';
import { PM_KIND } from '../lib/labels';


export default function PaymentMethods() {
  const { c } = useTheme();
  const { data, toast } = useData();
  const copy = async (text: string, what: string) => { await Clipboard.setStringAsync(text); toast(`${what} copied`); };
  const shareQr = async (uri: string) => {
    try { await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share QR code' }); } catch { toast('Couldn’t share the QR image.'); }
  };

  return (
    <Screen title="Payment methods" subtitle="Your QR codes and account numbers, ready when someone pays you. Stored only on this phone." back
      right={<Button small icon="plus" label="Add" onPress={() => router.push('/payment-method/new')} />}>
      {data.paymentMethods.length === 0 ? <Empty icon="qrcode" title="No payment methods" text="Add your GCash or Maya QR, or a bank account number." action="Add one" onAction={() => router.push('/payment-method/new')} /> : null}
      <View style={{ gap: 14 }}>
        {data.paymentMethods.map(pm => {
          const k = PM_KIND[pm.kind] ?? PM_KIND.other;
          return (
            <Card key={pm.id} style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <IconBubble icon={k.icon} color={k.color} />
                <View style={{ flex: 1 }}><T v="h3">{pm.label}</T><T v="small">{k.label}{pm.accountName ? ` · ${pm.accountName}` : ''}</T></View>
                <IconButton name="pencil-outline" label={`Edit ${pm.label}`} onPress={() => router.push(`/payment-method/${pm.id}`)} filled />
              </View>
              {pm.qrUri ? (
                <Pressable onPress={() => shareQr(pm.qrUri!)} accessibilityRole="button" accessibilityLabel={`Share ${pm.label} QR code`}
                  style={{ alignSelf: 'center', backgroundColor: '#fff', borderRadius: radius.lg, padding: 12, borderWidth: 3, borderColor: k.color }}>
                  <Image source={{ uri: pm.qrUri }} style={{ width: 220, height: 220 }} resizeMode="contain" />
                </Pressable>
              ) : null}
              {pm.accountNumber ? (
                <Pressable onPress={() => copy(pm.accountNumber, 'Number')} accessibilityRole="button" accessibilityHint="Copies the number"
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: c.sunk, borderRadius: radius.md, padding: 14 }}>
                  <T v="num" style={{ fontSize: 20, letterSpacing: 1 }}>{pm.accountNumber}</T>
                  <Icon name="content-copy" size={20} color={c.muted} />
                </Pressable>
              ) : null}
              {pm.note ? <T v="small">{pm.note}</T> : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {pm.qrUri ? <Button small icon="share-variant" label="Share QR" onPress={() => shareQr(pm.qrUri!)} style={{ flex: 1 }} /> : null}
                {pm.accountNumber ? <Button small variant="secondary" icon="content-copy" label="Copy details" style={{ flex: 1 }}
                  onPress={() => copy(`${pm.label}\n${pm.accountName}\n${pm.accountNumber}`.trim(), 'Details')} /> : null}
              </View>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}
