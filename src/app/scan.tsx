import React, { useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useData } from '../data/DataContext';
import { radius, useTheme } from '../theme';
import { Button, Card, Chip, DateField, Empty, Field, Note, Screen, Section, Select, T } from '../components/ui';
import { keepPhoto, useAccountOptions, useCategoryOptions } from '../components/domain';
import { guessCategory, parseReceipt, type ReceiptGuess } from '../lib/receipt';
import { ocrSupported, readText } from '../data/ocr';
import { inputValue, peso, todayISO, toCentavos } from '../lib/money';

const isSupported = ocrSupported;
const readReceipt = readText;

export default function Scan() {
  const { c } = useTheme();
  const { data, parseCats, toast } = useData();
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [guess, setGuess] = useState<ReceiptGuess | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState((data.settings.lastUsedAccount as string) || (data.settings.defaultAccountId as string) || '');
  const [showText, setShowText] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const accountOptions = useAccountOptions();
  const catOptions = useCategoryOptions('expense');

  const pick = async (camera: boolean) => {
    try {
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { toast('Camera permission is off. Turn it on in Settings to scan.'); return; }
      }
      // Full quality: OCR needs sharp text. The kept copy is what gets attached to the expense.
      const res = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (res.canceled || !res.assets?.[0]) return;
      setBusy(true); setGuess(null); setFailure(null);
      const kept = await keepPhoto(res.assets[0].uri);
      setPhoto(kept);
      const rows = await readReceipt(kept);
      const g = parseReceipt(rows, todayISO());
      setGuess(g);
      setAmount(g.total ? inputValue(g.total) : '');
      setNote(g.merchant ?? '');
      setDate(g.date ?? todayISO());
      setCategoryId(guessCategory(g, parseCats) ?? '');
      if (!rows.length) toast('No text found. Try again with the receipt flat and well lit.');
    } catch (e) {
      console.warn(e);
      // Show the real reason so a failure can be reported, and still let the person continue by hand.
      setFailure(e instanceof Error ? e.message : String(e));
      setGuess({ total: null, date: null, merchant: null, amounts: [], lines: [] });
      toast('Couldn’t read that photo. You can still type the amount.');
    } finally { setBusy(false); }
  };

  const review = () => {
    router.replace({ pathname: '/tx/[id]', params: { id: 'new', type: 'expense', amount: amount.trim(), note: note.trim(), date, photo: photo ?? '', category: categoryId, account: accountId } });
  };

  const amt = toCentavos(amount || '0');

  return (
    <Screen title="Scan receipt" subtitle="Reads the total, date and store on your phone. Nothing is uploaded." back>
      {!isSupported ? (
        <Note tone="warn" icon="cellphone-off">{'Receipt reading works in the phone app, not in this preview.'}</Note>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: isSupported ? 0 : 14 }}>
        <Button icon="camera-outline" label="Take photo" onPress={() => pick(true)} style={{ flex: 1 }} disabled={busy || !isSupported} />
        <Button icon="image-outline" variant="secondary" label="From photos" onPress={() => pick(false)} style={{ flex: 1 }} disabled={busy || !isSupported} />
      </View>
      <T v="small" style={{ marginTop: 8 }}>Lay the receipt flat, fill the frame, avoid shadows. The first scan may take a few seconds while your phone sets up text reading.</T>

      {busy ? (
        <Card style={{ marginTop: 16, alignItems: 'center', gap: 10, paddingVertical: 28 }}>
          <ActivityIndicator color={c.mango} size="large" />
          <T v="medium">Reading receipt…</T>
        </Card>
      ) : null}

      {!busy && !guess && !photo ? (
        <View style={{ marginTop: 16 }}><Empty icon="line-scan" title="Scan a receipt" text="Cynct fills in the expense; you check it and save." /></View>
      ) : null}

      {failure ? <View style={{ marginTop: 14 }}><Note tone="warn" icon="alert-outline">{`Reading failed: ${failure}`}</Note></View> : null}

      {photo && guess && !busy ? (
        <>
          <Card style={{ marginTop: 16, flexDirection: 'row', gap: 14 }}>
            <Image source={{ uri: photo }} style={{ width: 86, height: 120, borderRadius: radius.md, backgroundColor: c.sunk }} />
            <View style={{ flex: 1, gap: 4 }}>
              <T v="label">Found</T>
              <T v="numLg">{amt > 0 ? peso(amt) : 'No total'}</T>
              <T v="small">{guess.merchant ?? 'Store not found'}</T>
              <T v="small">{guess.date ? `Dated ${guess.date}` : 'No date found, using today'}</T>
            </View>
          </Card>

          {guess.amounts.length > 1 ? (
            <Section title="Wrong total? Tap the right one" style={{ marginTop: 18 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {guess.amounts.map(v => <Chip key={v} label={peso(v)} selected={v === amt} onPress={() => setAmount(inputValue(v))} />)}
              </View>
            </Section>
          ) : null}

          <View style={{ gap: 14, marginTop: 18 }}>
            <Field label="Amount" big value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
            <Field label="Store / note" value={note} onChangeText={setNote} placeholder="e.g. Alturas" maxLength={120} />
            <DateField label="Date" value={date} onChange={(v) => v && setDate(v)} />
            <Select label="Category" value={categoryId} options={catOptions} onChange={setCategoryId} />
            <Select label="Paid from" value={accountId} options={accountOptions} onChange={setAccountId} />
            <Button icon="arrow-right" label="Review and save" onPress={review} disabled={!(amt > 0)} />
            <Button variant="ghost" small label={showText ? 'Hide what was read' : 'Show what was read'} onPress={() => setShowText(!showText)} />
            {showText ? <Card><T v="small" style={{ fontFamily: undefined }}>{guess.lines.join('\n') || '(nothing)'}</T></Card> : null}
          </View>
        </>
      ) : null}
    </Screen>
  );
}
