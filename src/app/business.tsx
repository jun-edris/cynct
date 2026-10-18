import React, { useState } from 'react';
import { View } from 'react-native';
import { useData } from '../data/DataContext';
import { Button, Field, Footer, Screen, T, close } from '../components/ui';
import { setSetting } from '../db/repo';
import { EMPTY_BUSINESS, type Business } from '../lib/invoice';

export default function BusinessInfo() {
  const { data, act } = useData();
  const saved = { ...EMPTY_BUSINESS, ...((data.settings.business as Partial<Business>) ?? {}) };
  const [b, setB] = useState<Business>(saved);
  const set = (k: keyof Business) => (v: string) => setB(prev => ({ ...prev, [k]: v }));
  return (
    <>
      <Screen title="Business info" subtitle="Printed at the top of every invoice." back padBottom={30}>
        <View style={{ gap: 14 }}>
          <Field label="Name" value={b.name} onChangeText={set('name')} placeholder="Your name or business name" maxLength={80} />
          <Field label="Email" value={b.email} onChangeText={set('email')} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" />
          <Field label="Phone" value={b.phone} onChangeText={set('phone')} placeholder="Optional" keyboardType="phone-pad" />
          <Field label="Address" value={b.address} onChangeText={set('address')} placeholder="Optional" multiline />
          <Field label="TIN" value={b.tin} onChangeText={set('tin')} placeholder="Optional, e.g. 123-456-789-000" />
          <Field label="How to pay you" value={b.payment} onChangeText={set('payment')} multiline
            placeholder={'e.g. Wise (USD): account details\nGCash: 0917 000 0000'} />
          <T v="small">Saved on this phone and included in your backups.</T>
        </View>
      </Screen>
      <Footer><Button label="Save" icon="check" style={{ flex: 1 }} onPress={() => { if (act(db => setSetting(db, 'business', b), 'Business info saved')) close(); }} /></Footer>
    </>
  );
}
