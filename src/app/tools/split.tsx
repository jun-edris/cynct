import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useData } from '../../data/DataContext';
import { Button, Card, Chip, Field, FormRow, Screen, T } from '../../components/ui';
import { splitBill } from '../../lib/finance';
import { peso, toCentavos } from '../../lib/money';

export default function SplitTool() {
  const { toast } = useData();
  const [amount, setAmount] = useState('');
  const [people, setPeople] = useState('2');
  const [service, setService] = useState('0');
  const [tip, setTip] = useState('');
  const [round, setRound] = useState(100);
  const a = toCentavos(amount || '0'), n = parseInt(people, 10) || 0;
  const res = a > 0 && n > 0 ? splitBill(a, n, (Number(service) || 0) / 100, toCentavos(tip || '0') || 0, round) : null;

  const share = async () => {
    if (!res) return;
    await Clipboard.setStringAsync(`Bill ${peso(res.total)} split ${n} ways: ${peso(res.perPerson)} each.`);
    toast('Copied. Paste it in your group chat.');
  };

  return (
    <Screen title="Split the bill" subtitle="Even shares, with service charge and tip." back>
      <View style={{ gap: 14 }}>
        <Field label="Bill total" big value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" autoFocus />
        <FormRow>
          <View style={{ flex: 1 }}><Field label="People" value={people} onChangeText={setPeople} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><Field label="Service charge %" value={service} onChangeText={setService} keyboardType="decimal-pad" /></View>
        </FormRow>
        <Field label="Tip (optional)" value={tip} onChangeText={setTip} keyboardType="decimal-pad" placeholder="0" />
        <View style={{ gap: 8 }}>
          <T v="label">Round each share up to</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[[1, 'Centavo'], [100, '₱1'], [500, '₱5'], [1000, '₱10']].map(([v, l]) => <Chip key={l} label={String(l)} selected={round === v} onPress={() => setRound(Number(v))} />)}
          </View>
        </View>
      </View>
      {res ? (
        <Card style={{ marginTop: 16, gap: 6 }}>
          <T v="label">Each person pays</T>
          <T v="display">{peso(res.perPerson)}</T>
          <T v="small">{`Total ${peso(res.total)}${res.service ? ` incl. ${peso(res.service)} service` : ''}${res.remainder ? ` · ${peso(res.remainder)} extra from rounding` : ''}`}</T>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <Button small variant="secondary" icon="content-copy" label="Copy" onPress={share} style={{ flex: 1 }} />
            <Button small icon="plus" label="Log my share" style={{ flex: 1 }}
              onPress={() => router.push({ pathname: '/tx/[id]', params: { id: 'new', type: 'expense', amount: String(res.perPerson / 100), note: 'My share' } })} />
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}
