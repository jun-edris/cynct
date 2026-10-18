import React, { useState } from 'react';
import { Image, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { useData } from '../../data/DataContext';
import { Button, Chip, ErrorText, Field, Footer, Screen, T, close } from '../../components/ui';
import { PM_KIND } from '../../lib/labels';
import { remove, upsert } from '../../db/repo';
import { uid, nowMs } from '../../lib/money';

export default function PaymentMethodScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, act, toast } = useData();
  const pm = data.paymentMethods.find(x => x.id === id);
  const [label, setLabel] = useState(pm?.label ?? '');
  const [kind, setKind] = useState(pm?.kind ?? 'gcash');
  const [accountName, setAccountName] = useState(pm?.accountName ?? '');
  const [accountNumber, setAccountNumber] = useState(pm?.accountNumber ?? '');
  const [qrUri, setQrUri] = useState<string | null>(pm?.qrUri ?? null);
  const [note, setNote] = useState(pm?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const pickQr = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    try {
      // Copy into the app's own folder so the QR survives the original being deleted from the gallery.
      const dir = new Directory(Paths.document, 'qr');
      dir.create({ idempotent: true, intermediates: true });
      const ext = res.assets[0].uri.split('.').pop()?.split('?')[0] || 'png';
      const dest = new File(dir, `${pm?.id ?? uid()}-${nowMs()}.${ext}`);
      await new File(res.assets[0].uri).copy(dest);
      setQrUri(dest.uri);
    } catch { toast('Couldn’t save that image.'); }
  };

  const save = () => {
    setError(null);
    if (!label.trim()) return setError('Give it a label, like “GCash personal”.');
    if (!qrUri && !accountNumber.trim()) return setError('Add a QR image or an account number.');
    const row = { id: pm?.id ?? uid(), label: label.trim(), kind, accountName: accountName.trim(), accountNumber: accountNumber.trim(), qrUri, note: note.trim(),
      sort: pm?.sort ?? data.paymentMethods.length };
    if (act(db => upsert.paymentMethod(db, row), 'Saved')) close();
  };

  return (
    <>
      <Screen title={pm ? pm.label : 'New payment method'} back padBottom={30}>
        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(PM_KIND).map(([k, v]) => <Chip key={k} icon={v.icon} label={v.label} selected={kind === k} onPress={() => setKind(k)} />)}
          </View>
          <Field label="Label" value={label} onChangeText={setLabel} placeholder="e.g. GCash personal" maxLength={40} />
          <Field label="Account name" value={accountName} onChangeText={setAccountName} placeholder="As it appears to the sender" maxLength={60} />
          <Field label="Number" value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" placeholder="Mobile or account number" maxLength={30} />
          <View style={{ gap: 8 }}>
            <T v="label">QR code</T>
            {qrUri ? <Image source={{ uri: qrUri }} style={{ width: 200, height: 200, alignSelf: 'center', backgroundColor: '#fff', borderRadius: 16 }} resizeMode="contain" /> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button small variant="secondary" icon="qrcode" label={qrUri ? 'Replace QR' : 'Pick QR from gallery'} onPress={pickQr} style={{ flex: 1 }} />
              {qrUri ? <Button small label="Remove" variant="danger" onPress={() => setQrUri(null)} /> : null}
            </View>
            <T v="small">Screenshot your QR in the GCash or Maya app first, then pick it here.</T>
          </View>
          <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" maxLength={120} />
          <ErrorText text={error} />
          {pm ? <Button variant="danger" label="Delete" onPress={() => { if (act(db => remove.paymentMethod(db, pm.id), 'Deleted')) close(); }} /> : null}
        </View>
      </Screen>
      <Footer><Button label="Save" icon="check" onPress={save} style={{ flex: 1 }} /></Footer>
    </>
  );
}
