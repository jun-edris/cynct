import React, { useState } from 'react';
import { View } from 'react-native';
import { useData } from '../data/DataContext';
import { useTheme } from '../theme';
import { Button, Card, List, Note, Row, Screen, Section, T, TimeField, Toggle, formatTime } from '../components/ui';
import { setSetting } from '../db/repo';
import { askPermission, readPrefs, sendTest } from '../lib/notify';
import { planReminders, type ReminderPrefs } from '../lib/reminders';
import { dayLabel, todayISO } from '../lib/money';

export default function NotificationsScreen() {
  const { c } = useTheme();
  const { data, act, toast, balances, rtx, fmt } = useData();
  const prefs = readPrefs(data.settings);
  const [denied, setDenied] = useState(false);
  const save = (patch: Partial<ReminderPrefs>, msg?: string) => act(db => setSetting(db, 'notify', { ...prefs, ...patch }), msg);

  const toggleAll = async (on: boolean) => {
    if (on && !(await askPermission())) { setDenied(true); toast('Notifications are blocked. Allow them for Cynct in your phone’s Settings → Apps.'); return; }
    setDenied(false);
    save({ enabled: on }, on ? 'Reminders on' : 'Reminders off');
  };

  const upcoming = planReminders({ recurring: data.recurring, installments: data.installments, debts: data.debts, accounts: data.accounts, balances,
    goals: data.goals, txs: rtx, fmt }, { ...prefs, enabled: true }, todayISO(), 14);

  return (
    <Screen title="Reminders" subtitle="Local notifications on this phone. Nothing is sent anywhere." back>
      <Card style={{ gap: 12 }}>
        <Toggle label="Reminders" hint="Bills, paydays, due dates and a daily check-in." value={prefs.enabled} onChange={toggleAll} />
        {prefs.enabled ? <TimeField label="Reminder time" value={prefs.time} onChange={(v) => save({ time: v }, `Reminders at ${formatTime(v)}`)} /> : null}
      </Card>
      {denied ? <View style={{ marginTop: 12 }}><Note tone="warn" icon="bell-off-outline">Notifications are blocked for Cynct. Turn them on in your phone’s Settings → Apps → Cynct → Notifications, then try again.</Note></View> : null}

      <Section title="What to remind you about">
        <Card style={{ gap: 14, opacity: prefs.enabled ? 1 : 0.5 }}>
          <Toggle label="Daily check-in" hint="A nudge to log what you spent today." value={prefs.daily} onChange={(v) => save({ daily: v })} />
          <Toggle label="Bills, paydays and installments" hint="On the due date, plus a heads-up the day before a bill." value={prefs.bills} onChange={(v) => save({ bills: v })} />
          <Toggle label="Debts" hint="3 days before and on the due date, both ways." value={prefs.debts} onChange={(v) => save({ debts: v })} />
          <Toggle label="Credit card due days" hint="2 days before and on the day, when you owe something." value={prefs.cards} onChange={(v) => save({ cards: v })} />
          <Toggle label="Goal target dates" hint="A week before and on the day." value={prefs.goals} onChange={(v) => save({ goals: v })} />
        </Card>
      </Section>

      {prefs.enabled ? <Button variant="secondary" icon="bell-ring-outline" label="Send a test notification" style={{ marginTop: 14 }} onPress={() => sendTest().catch(() => toast('Couldn’t send a test.'))} /> : null}

      <Section title="Next two weeks">
        {upcoming.length ? (
          <List>{upcoming.slice(0, 12).map(r => (
            <Row key={r.key} icon="bell-outline" iconColor={c.mango} title={r.title} sub={`${dayLabel(r.date)} · ${formatTime(prefs.time)}`} />
          ))}</List>
        ) : <T v="muted">Nothing due. Add planned payments, debts with due dates, or a card due day.</T>}
      </Section>
    </Screen>
  );
}
