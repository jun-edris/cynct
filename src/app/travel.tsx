import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useData } from '../data/DataContext';
import { useTheme } from '../theme';
import { Block, Button, DateField, Empty, ErrorText, Field, IconBubble, IconPicker, List, Row, Screen, Section, Sheet, T } from '../components/ui';
import { remove, upsert } from '../db/repo';
import { dayLabel, daysBetween, nowMs, peso, todayISO, uid } from '../lib/money';
import type { Trip } from '../db/schema';

const TRIP_ICONS = ['airplane', 'beach', 'island', 'car', 'bus', 'ferry', 'train', 'tent', 'image-filter-hdr', 'city-variant-outline', 'bag-suitcase', 'map-marker'];

export default function Travel() {
  const { c } = useTheme();
  const { data, act, rtx } = useData();
  const [editing, setEditing] = useState<Trip | 'new' | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('airplane');
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = data.trips.find(t => !t.endDate);
  const totals = new Map<string, { spent: number; n: number }>();
  for (const t of rtx) {
    if (!t.tripId) continue;
    const v = totals.get(t.tripId) ?? { spent: 0, n: 0 };
    v.n++;
    if (t.type === 'expense') v.spent += t.amount;
    if ((t.type === 'transfer' || t.type === 'ext_out') && t.fee) v.spent += t.fee;
    totals.set(t.tripId, v);
  }
  const trip = editing && editing !== 'new' ? editing : null;
  const open = (t: Trip | 'new') => {
    setError(null); setEditing(t);
    setName(t === 'new' ? '' : t.name); setIcon(t === 'new' ? 'airplane' : t.icon); setStart(t === 'new' ? todayISO() : t.startDate); setEnd(t === 'new' ? null : t.endDate);
  };
  const save = () => {
    if (!name.trim()) return setError('Name the trip.');
    if (end && end < start) return setError('The trip ends before it starts.');
    if (!trip && !end && active) return setError(`End “${active.name}” first. Only one trip can be on at a time.`);
    const row = { id: trip?.id ?? uid(), name: name.trim(), icon, startDate: start, endDate: end, createdAt: trip?.createdAt ?? nowMs() };
    if (act(db => upsert.trip(db, row), trip ? 'Saved' : `Travel mode on: ${row.name}`)) setEditing(null);
  };
  const seeEntries = (id: string) => router.push({ pathname: '/history', params: { trip: id, n: String(nowMs()) } });

  return (
    <Screen title="Travel" subtitle="Turn on travel mode and every new entry is tagged to the trip." back>
      {active ? (
        <Block tone="navy">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconBubble icon={active.icon} color={c.mango} solid size={48} />
            <View style={{ flex: 1 }}>
              <T v="label" color={c.navyMuted}>Travel mode on · day {daysBetween(active.startDate, todayISO()) + 1}</T>
              <T v="h2" color={c.navyText}>{active.name}</T>
            </View>
          </View>
          <T v="display" color={c.navyText} style={{ marginTop: 12 }}>{peso(totals.get(active.id)?.spent ?? 0, { cents: false })}</T>
          <T v="small" color={c.navyMuted}>spent since {dayLabel(active.startDate) === "Today" ? "today" : dayLabel(active.startDate)}</T>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Button label="End trip" icon="flag-checkered" onPress={() => act(db => upsert.trip(db, { ...active, endDate: todayISO() }), `${active.name} ended`)} style={{ flex: 1 }} />
            <Button label="Entries" variant="secondary" onPress={() => seeEntries(active.id)} style={{ flex: 1 }} />
          </View>
        </Block>
      ) : (
        <Button icon="airplane-takeoff" label="Start a trip" onPress={() => open('new')} />
      )}

      <Section title="Trips">
        {data.trips.length ? <List>{data.trips.map(t => {
          const v = totals.get(t.id) ?? { spent: 0, n: 0 };
          return <Row key={t.id} left={<IconBubble icon={t.icon} color={t.endDate ? c.info : c.mango} />} title={t.name}
            sub={`${dayLabel(t.startDate)} – ${t.endDate ? dayLabel(t.endDate) : 'now'} · ${v.n} entr${v.n === 1 ? 'y' : 'ies'}`}
            right={<T v="num">{peso(v.spent, { cents: false })}</T>} onPress={() => open(t)} />;
        })}</List> : <Empty icon="bag-suitcase-outline" title="No trips yet" text="Going to Siargao? Start a trip and see exactly what it cost when you’re back." />}
      </Section>

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={trip ? trip.name : 'New trip'}>
        <View style={{ gap: 14 }}>
          <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Siargao 2026" maxLength={40} />
          <IconPicker value={icon} icons={TRIP_ICONS} color={c.mango} onChange={setIcon} />
          <DateField label="Starts" value={start} onChange={(v) => v && setStart(v)} />
          {trip ? <DateField label="Ended" value={end} onChange={setEnd} allowClear placeholder="Still going" /> : null}
          <ErrorText text={error} />
          <Button label={trip ? 'Save' : 'Start trip'} icon="check" onPress={save} />
          {trip ? <Button variant="secondary" label="See entries" onPress={() => { setEditing(null); seeEntries(trip.id); }} /> : null}
          {trip ? <Button variant="danger" label="Delete trip" onPress={() => { if (act(db => remove.trip(db, trip.id), 'Trip deleted. Entries are kept.')) setEditing(null); }} /> : null}
        </View>
      </Sheet>
    </Screen>
  );
}
