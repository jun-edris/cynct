import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useData } from '../../data/DataContext';
import { fonts, radius, useTheme } from '../../theme';
import { Button, DateField, Footer, IconButton, Screen, Toggle, close } from '../../components/ui';
import { remove, upsert } from '../../db/repo';
import { nowMs, uid } from '../../lib/money';

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { data, act } = useData();
  const n = data.notes.find(x => x.id === id);
  const [title, setTitle] = useState(n?.title ?? '');
  const [body, setBody] = useState(n?.body ?? '');
  const [pinned, setPinned] = useState(n?.pinned ?? false);
  const [remindOn, setRemindOn] = useState<string | null>(n?.remindOn ?? null);

  const save = () => {
    if (!title.trim() && !body.trim()) { close(); return; }
    const row = { id: n?.id ?? uid(), title: title.trim(), body: body.trim(), pinned, remindOn, createdAt: n?.createdAt ?? nowMs(), updatedAt: nowMs() };
    if (act(db => upsert.note(db, row), n ? 'Saved' : 'Note added')) close();
  };

  return (
    <>
      <Screen title={n ? 'Note' : 'New note'} back padBottom={30}
        right={n ? <IconButton name="trash-can-outline" label="Delete note" filled color={c.spend} onPress={() => { if (act(db => remove.note(db, n.id), 'Note deleted')) close(); }} /> : undefined}>
        <View style={{ gap: 14 }}>
          <TextInput value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={c.faint} accessibilityLabel="Title" maxLength={80}
            style={{ fontFamily: fonts.numBlack, fontSize: 24, color: c.ink, paddingVertical: 6 }} />
          <TextInput value={body} onChangeText={setBody} placeholder="Write anything…" placeholderTextColor={c.faint} accessibilityLabel="Note" multiline
            style={{ fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: c.ink, minHeight: 220, textAlignVertical: 'top',
              backgroundColor: c.surface, borderRadius: radius.lg, padding: 16 }} />
          <Toggle label="Pin to Home" value={pinned} onChange={setPinned} />
          <DateField label="Follow-up date" value={remindOn} onChange={setRemindOn} allowClear placeholder="None" />
        </View>
      </Screen>
      <Footer><Button label="Save" icon="check" onPress={save} style={{ flex: 1 }} /></Footer>
    </>
  );
}
