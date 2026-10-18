import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useData, safeJson } from '../../data/DataContext';
import { Button, ColorPicker, ErrorText, Field, Footer, IconBubble, IconPicker, Screen, Segmented, Select, T, Toggle, close } from '../../components/ui';
import { remove, upsert } from '../../db/repo';
import { SWATCHES } from '../../lib/seed';
import { uid } from '../../lib/money';

const CATEGORY_ICONS = ['silverware-fork-knife', 'cart', 'coffee', 'food', 'bus', 'gas-station', 'motorbike', 'car', 'cellphone', 'receipt', 'flash', 'wifi', 'water',
  'repeat', 'shopping', 'gamepad-variant', 'medical-bag', 'account-group', 'home-city', 'cash-minus', 'school', 'paw', 'gift', 'airplane', 'beach', 'baby-carriage',
  'tshirt-crew', 'dumbbell', 'book-open-variant', 'briefcase', 'laptop', 'chart-bar', 'storefront', 'lightning-bolt', 'wallet', 'cash-refund', 'percent', 'chart-pie',
  'home-account', 'hand-heart', 'church', 'tools', 'dots-horizontal'];

export default function CategoryScreen() {
  const { id, kind: kindParam } = useLocalSearchParams<{ id: string; kind?: string }>();
  const { data, act } = useData();
  const cat = data.categories.find(x => x.id === id);
  const [kind, setKind] = useState<'expense' | 'income'>((cat?.kind as 'expense' | 'income') ?? (kindParam === 'income' ? 'income' : 'expense'));
  const [name, setName] = useState(cat?.name ?? '');
  const [parentId, setParentId] = useState(cat?.parentId ?? '');
  const [color, setColor] = useState(cat?.color ?? SWATCHES[0]);
  const [icon, setIcon] = useState(cat?.icon && cat.icon !== 'shape' ? cat.icon : 'dots-horizontal');
  const [keywords, setKeywords] = useState(safeJson<string[]>(cat?.keywords, []).join(', '));
  const [hidden, setHidden] = useState(cat?.archived ?? false);
  const [error, setError] = useState<string | null>(null);
  const hasChildren = cat ? data.categories.some(x => x.parentId === cat.id) : false;
  const used = cat ? data.transactions.filter(t => t.categoryId === cat.id).length : 0;
  const parentOptions = [{ value: '', label: 'None (top level)' },
    ...data.categories.filter(x => x.kind === kind && !x.parentId && x.id !== cat?.id).map(x => ({ value: x.id, label: x.name, color: x.color, icon: x.icon }))];

  const save = () => {
    setError(null);
    if (!name.trim()) return setError('Give it a name.');
    if (hasChildren && parentId) return setError('A category with subcategories can’t go inside another one.');
    const kw = keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    const row = { id: cat?.id ?? uid(), kind, name: name.trim(), parentId: parentId || null, color, icon, keywords: JSON.stringify(kw), archived: hidden, sort: cat?.sort ?? data.categories.length };
    if (act(db => upsert.category(db, row), cat ? 'Saved changes' : `Added ${row.name}`)) close();
  };

  return (
    <>
      <Screen title={cat ? cat.name : 'New category'} back padBottom={30}>
        <View style={{ alignItems: 'center', marginBottom: 16 }}><IconBubble icon={icon} color={color} size={72} solid /></View>
        <View style={{ gap: 16 }}>
          {!cat ? <Segmented value={kind} onChange={(v) => { setKind(v); setParentId(''); }} options={[['expense', 'Spending'], ['income', 'Income']]} /> : null}
          <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Pets" maxLength={40} />
          <Select label="Inside" value={parentId} options={parentOptions} onChange={setParentId} />
          <IconPicker value={icon} icons={CATEGORY_ICONS} color={color} onChange={setIcon} />
          <ColorPicker value={color} colors={SWATCHES} onChange={setColor} />
          <Field label="Quick entry words" value={keywords} onChangeText={setKeywords} placeholder="e.g. vet, petfood" autoCapitalize="none"
            hint="Comma-separated. Typing one of these in “Type it” picks this category." />
          <Toggle label="Hide from pickers" hint="Keeps its history but stops it showing when you add something." value={hidden} onChange={setHidden} />
          {cat && used ? <T v="small">Deleting keeps its {used} transaction{used === 1 ? '' : 's'} as uncategorized{hasChildren ? ' and moves its subcategories to the top level' : ''}. Budgets for it are removed.</T> : null}
          <ErrorText text={error} />
          {cat ? <Button variant="danger" label="Delete category" onPress={() => { if (act(db => remove.category(db, cat.id), `Deleted ${cat.name}`)) close(); }} /> : null}
        </View>
      </Screen>
      <Footer><Button label={cat ? 'Save changes' : 'Create category'} icon="check" onPress={save} style={{ flex: 1 }} /></Footer>
    </>
  );
}
