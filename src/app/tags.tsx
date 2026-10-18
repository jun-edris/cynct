import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useData, safeJson } from '../data/DataContext';
import { useTheme } from '../theme';
import { Button, ColorPicker, Empty, ErrorText, Field, IconBubble, List, Row, Screen, Sheet, T } from '../components/ui';
import { remove, upsert } from '../db/repo';
import { SWATCHES } from '../lib/seed';
import { nowMs, peso, uid } from '../lib/money';
import type { Tag } from '../db/schema';

export default function Tags() {
  const { c } = useTheme();
  const { data, act } = useData();
  const [editing, setEditing] = useState<Tag | 'new' | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[0]);
  const [error, setError] = useState<string | null>(null);
  const stats = new Map<string, { n: number; spent: number }>();
  for (const t of data.transactions) {
    for (const id of safeJson<string[]>(t.tags, [])) {
      const s = stats.get(id) ?? { n: 0, spent: 0 };
      s.n++;
      if (t.type === 'expense') s.spent += t.amount;
      stats.set(id, s);
    }
  }
  const tag = editing && editing !== 'new' ? editing : null;

  const open = (t: Tag | 'new') => { setError(null); setEditing(t); setName(t === 'new' ? '' : t.name); setColor(t === 'new' ? SWATCHES[data.tags.length % SWATCHES.length] : t.color); };
  const save = () => {
    const n = name.trim().replace(/^#/, '');
    if (!n) return setError('Give it a name.');
    if (data.tags.some(t => t.name.toLowerCase() === n.toLowerCase() && t.id !== tag?.id)) return setError('That tag already exists.');
    if (act(db => upsert.tag(db, { id: tag?.id ?? uid(), name: n, color, createdAt: tag?.createdAt ?? nowMs() }), tag ? 'Saved' : `Added #${n}`)) setEditing(null);
  };

  return (
    <Screen title="Tags" subtitle="Label entries across categories, like #reimbursable or #birthday." back
      right={<Button small icon="plus" label="New" onPress={() => open('new')} />}>
      {data.tags.length ? (
        <List>{data.tags.map(t => {
          const s = stats.get(t.id) ?? { n: 0, spent: 0 };
          return <Row key={t.id} left={<IconBubble icon="pound" color={t.color} />} title={t.name} sub={`${s.n} entr${s.n === 1 ? 'y' : 'ies'}`}
            right={<T v="num">{peso(s.spent, { cents: false })}</T>} onPress={() => open(t)} />;
        })}</List>
      ) : <Empty icon="tag-multiple-outline" title="No tags yet" text="Add tags here or while entering an expense." action="Create a tag" onAction={() => open('new')} />}

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={tag ? `#${tag.name}` : 'New tag'}>
        <View style={{ gap: 14 }}>
          <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. reimbursable" autoCapitalize="none" maxLength={30} />
          <ColorPicker value={color} colors={SWATCHES} onChange={setColor} />
          <ErrorText text={error} />
          <Button label="Save" icon="check" onPress={save} />
          {tag ? <Button variant="secondary" icon="format-list-bulleted" label="See entries" onPress={() => { setEditing(null); router.push({ pathname: '/history', params: { tag: tag.id, n: String(nowMs()) } }); }} /> : null}
          {tag ? <Button variant="danger" label="Delete tag" onPress={() => { if (act(db => remove.tag(db, tag.id), 'Tag removed from all entries')) setEditing(null); }} /> : null}
          {tag && (stats.get(tag.id)?.n ?? 0) > 0 ? <T v="small" color={c.muted}>Deleting removes the tag from its entries. The entries stay.</T> : null}
        </View>
      </Sheet>
    </Screen>
  );
}
