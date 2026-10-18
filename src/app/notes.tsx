import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useData } from '../data/DataContext';
import { useTheme } from '../theme';
import { Button, Card, Empty, Icon, Screen, T } from '../components/ui';
import { dayLabel, todayISO } from '../lib/money';

export default function Notes() {
  const { c } = useTheme();
  const { data } = useData();
  const list = [...data.notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  return (
    <Screen title="Notes" subtitle="Reminders, account details, money plans." back right={<Button small icon="plus" label="New" onPress={() => router.push('/note/new')} />}>
      {list.length ? (
        <View style={{ gap: 10 }}>
          {list.map(n => (
            <Card key={n.id} onPress={() => router.push(`/note/${n.id}`)} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {n.pinned ? <Icon name="pin" size={16} color={c.mango} /> : null}
                <T v="h3" style={{ flex: 1 }} numberOfLines={1}>{n.title || n.body.split('\n')[0] || 'Untitled'}</T>
              </View>
              {n.body ? <T v="muted" numberOfLines={3}>{n.title ? n.body : n.body.split('\n').slice(1).join('\n')}</T> : null}
              <T v="small" color={n.remindOn && n.remindOn <= todayISO() ? c.warn : undefined}>
                {n.remindOn ? `Follow up ${dayLabel(n.remindOn)} · ` : ''}Edited {dayLabel(todayISO(new Date(n.updatedAt)))}
              </T>
            </Card>
          ))}
        </View>
      ) : <Empty icon="note-text-outline" title="No notes yet" text="Pin one and it shows on Home." action="Write a note" onAction={() => router.push('/note/new')} />}
    </Screen>
  );
}
