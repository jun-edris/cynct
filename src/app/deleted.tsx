import React, { useState } from 'react';
import { View } from 'react-native';
import { useData } from '../data/DataContext';
import { Button, Empty, List, Screen, Sheet, T } from '../components/ui';
import { TxRow } from '../components/domain';
import { purge, restore } from '../db/repo';
import { daysBetween, todayISO } from '../lib/money';

export default function Deleted() {
  const { data, act } = useData();
  const [picked, setPicked] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const list = data.deleted;
  const t = list.find(x => x.id === picked);
  const daysLeft = (ms: number) => Math.max(0, 30 - daysBetween(todayISO(new Date(ms)), todayISO()));

  return (
    <Screen title="Recently deleted" subtitle="Entries stay here for 30 days, then they’re removed for good." back
      right={list.length ? <Button small variant="secondary" label="Empty" onPress={() => setConfirmAll(true)} /> : undefined}>
      {list.length ? (
        <List>{list.map(x => <TxRow key={x.id} t={x} showDate onPress={() => setPicked(x.id)} />)}</List>
      ) : <Empty icon="delete-empty-outline" title="Nothing here" text="Deleted entries can be restored from this screen for 30 days." />}

      <Sheet visible={!!t} onClose={() => setPicked(null)} title="Deleted entry">
        {t ? (
          <View style={{ gap: 12 }}>
            <T v="muted">Removed for good in {daysLeft(t.deletedAt ?? 0)} days. Restoring puts it back in history and account balances.</T>
            <Button icon="restore" label="Restore" onPress={() => { if (act(db => restore(db, [t.id]), 'Restored')) setPicked(null); }} />
            <Button variant="danger" label="Delete forever" onPress={() => { if (act(db => purge(db, [t.id]), 'Deleted forever')) setPicked(null); }} />
          </View>
        ) : null}
      </Sheet>
      <Sheet visible={confirmAll} onClose={() => setConfirmAll(false)} title={`Delete ${list.length} entries forever?`}>
        <View style={{ gap: 12 }}>
          <T v="muted">This can’t be undone.</T>
          <Button variant="danger" label="Delete forever" onPress={() => { if (act(db => purge(db, list.map(x => x.id)), 'Emptied')) setConfirmAll(false); }} />
          <Button variant="secondary" label="Restore all instead" onPress={() => { if (act(db => restore(db, list.map(x => x.id)), 'Restored')) setConfirmAll(false); }} />
        </View>
      </Sheet>
    </Screen>
  );
}
