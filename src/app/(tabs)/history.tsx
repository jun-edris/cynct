import React, { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useData, safeJson } from '../../data/DataContext';
import { fonts, radius, space, useTheme } from '../../theme';
import { Button, Chip, Icon, IconButton, Select, Sheet, T, DateField, type Option } from '../../components/ui';
import { GlassIcon, NightGradient } from '../../components/k';
import { TxRow, useCategoryName, useCategoryOptions } from '../../components/domain';
import { addDays, addMonths, compactPeso, dayLabel, lastDayOfMonth, monthLabel, peso, todayISO } from '../../lib/money';
import { descendantsOf, periodRange, summarize } from '../../lib/ledger';
import { softDelete, restore, updateMany } from '../../db/repo';
import type { Transaction } from '../../db/schema';

type Kind = 'all' | 'expense' | 'income' | 'transfer' | 'outside' | 'goals' | 'debts' | 'adjust';
const KINDS: [Kind, string][] = [['all', 'All'], ['expense', 'Spent'], ['income', 'Income'], ['transfer', 'Transfers'], ['outside', 'Outside'], ['goals', 'Goals'], ['debts', 'Debts'], ['adjust', 'Corrections']];
const matchesKind = (t: Transaction, k: Kind) => {
  switch (k) {
    case 'all': return true;
    case 'transfer': return t.type === 'transfer';
    case 'outside': return t.type === 'ext_in' || t.type === 'ext_out';
    case 'goals': return t.type.startsWith('goal_');
    case 'debts': return t.type === 'debt_in' || t.type === 'debt_out';
    default: return t.type === k;
  }
};

function rangePresets(today = todayISO()) {
  const m = today.slice(0, 7);
  const lastM = addMonths(`${m}-01`, -1);
  const wk = periodRange('weekly', today);
  return [
    { key: 'month', label: 'This month', start: `${m}-01`, end: lastDayOfMonth(today) },
    { key: 'lastmonth', label: 'Last month', start: lastM, end: lastDayOfMonth(lastM) },
    { key: 'week', label: 'This week', start: wk.start, end: wk.end },
    { key: 'lastweek', label: 'Last week', start: addDays(wk.start, -7), end: addDays(wk.start, -1) },
    { key: 'ytd', label: 'Year to date', start: `${today.slice(0, 4)}-01-01`, end: today },
    { key: 'all', label: 'All time', start: '1900-01-01', end: '2999-12-31' },
  ];
}

export default function History() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { data, cats, act, rtx } = useData();
  const catName = useCategoryName();
  const today = todayISO();
  const presets = rangePresets(today);
  const [range, setRange] = useState(presets[0]);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('all');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tripId, setTripId] = useState('');
  // Other screens open History pre-filtered (a tag or a trip). Apply each new request once, during render.
  const params = useLocalSearchParams<{ tag?: string; trip?: string; n?: string }>();
  const paramKey = `${params.tag ?? ''}|${params.trip ?? ''}|${params.n ?? ''}`;
  const [seenParams, setSeenParams] = useState('||');
  if (paramKey !== seenParams) {
    setSeenParams(paramKey);
    if (params.tag || params.trip) {
      setTagIds(params.tag ? [params.tag] : []);
      setTripId(params.trip ?? '');
      setRange(presets[presets.length - 1]);
    }
  }
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState<'none' | 'category' | 'tag'>('none');
  const selecting = selected.length > 0;
  const catOptions: Option[] = [{ value: '', label: 'All categories', icon: 'shape-outline' }, ...useCategoryOptions('expense', { allowNone: false }), ...useCategoryOptions('income', { allowNone: false })];

  const isMonth = /^\d{4}-\d{2}-01$/.test(range.start) && range.end === lastDayOfMonth(range.start);
  const shiftMonth = (n: number) => {
    const s = addMonths(range.start, n);
    setRange({ key: 'custom', label: monthLabel(s.slice(0, 7)), start: s, end: lastDayOfMonth(s) });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const catSet = categoryId ? descendantsOf(categoryId, cats) : null;
    const accName = new Map(data.accounts.map(a => [a.id, a.name.toLowerCase()]));
    return data.transactions.filter(t => {
      if (!q && (t.date < range.start || t.date > range.end)) return false;
      if (!matchesKind(t, kind)) return false;
      if (accountId && t.accountId !== accountId && t.toAccountId !== accountId) return false;
      if (catSet && !(t.categoryId && catSet.has(t.categoryId))) return false;
      if (tripId && t.tripId !== tripId) return false;
      if (tagIds.length && !safeJson<string[]>(t.tags, []).some(id => tagIds.includes(id))) return false;
      if (q) {
        const hay = `${t.note} ${catName(t.categoryId) ?? ''} ${t.accountId ? accName.get(t.accountId) : ''} ${t.toAccountId ? accName.get(t.toAccountId) : ''} ${t.counterparty ?? ''} ${(t.amount / 100).toFixed(2)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data.transactions, data.accounts, query, kind, accountId, categoryId, tagIds, tripId, range, cats, catName]);

  // Totals in pesos even when some entries are in another currency.
  const baseById = useMemo(() => new Map(rtx.map(t => [t.id, t])), [rtx]);
  const inPhp = (t: Transaction) => baseById.get(t.id) ?? t;
  const sum = summarize(filtered.map(inPhp), '1900-01-01', '2999-12-31', cats);
  const sections = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) { const l = map.get(t.date) ?? []; l.push(t); map.set(t.date, l); }
    return [...map.entries()].map(([date, items]) => ({ title: date, net: items.map(t => baseById.get(t.id) ?? t).reduce((s, t) => s + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0), data: items }));
  }, [filtered, baseById]);

  const activeFilters = (kind !== 'all' ? 1 : 0) + (accountId ? 1 : 0) + (categoryId ? 1 : 0) + (tagIds.length ? 1 : 0) + (tripId ? 1 : 0);
  const toggleSel = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const deleteSelected = () => {
    const ids = selected;
    if (act(db => softDelete(db, ids), `Moved ${ids.length} to Recently deleted`, { label: 'Undo', run: () => act(db => restore(db, ids)) })) setSelected([]);
  };

  const header = (
    <View style={{ paddingHorizontal: space.page }}>
      {searchOpen ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surface, borderRadius: radius.pill, paddingHorizontal: 14, marginBottom: 12 }}>
          <Icon name="magnify" size={20} color={c.muted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search all history" placeholderTextColor={c.faint} autoFocus accessibilityLabel="Search all history"
            style={{ flex: 1, minHeight: 48, color: c.ink, fontFamily: fonts.medium, fontSize: 16 }} autoCapitalize="none" />
          <Pressable onPress={() => { setQuery(''); setSearchOpen(false); }} hitSlop={8} accessibilityLabel="Close search"><Icon name="close" size={20} color={c.muted} /></Pressable>
        </View>
      ) : null}
      {!query ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {isMonth ? <IconButton name="chevron-left" label="Previous month" onPress={() => shiftMonth(-1)} /> : <View style={{ width: 44 }} />}
          <Pressable onPress={() => setFiltersOpen(true)} accessibilityRole="button" style={{ alignItems: 'center' }}>
            <T v="h2">{isMonth ? monthLabel(range.start.slice(0, 7)) : range.label}</T>
            {!isMonth && range.key !== 'all' ? <T v="small">{dayLabel(range.start)} – {dayLabel(range.end)}</T> : null}
          </Pressable>
          {isMonth && range.end < today ? <IconButton name="chevron-right" label="Next month" onPress={() => shiftMonth(1)} /> : <View style={{ width: 44 }} />}
        </View>
      ) : <T v="small" style={{ marginBottom: 4 }}>{filtered.length} result{filtered.length === 1 ? '' : 's'} across all time</T>}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: radius.md, padding: 14 }}>
          <T v="label">Money in</T>
          <T v="numLg" color={c.income} style={{ fontSize: 20 }}>{compactPeso(sum.income)}</T>
        </View>
        <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: radius.md, padding: 14 }}>
          <T v="label">Spent</T>
          <T v="numLg" color={c.spend} style={{ fontSize: 20 }}>{compactPeso(sum.expense)}</T>
        </View>
      </View>
      {activeFilters ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {kind !== 'all' ? <Chip label={KINDS.find(k => k[0] === kind)![1]} icon="close" selected onPress={() => setKind('all')} /> : null}
          {accountId ? <Chip label={data.accounts.find(a => a.id === accountId)?.name ?? 'Account'} icon="close" selected onPress={() => setAccountId('')} /> : null}
          {categoryId ? <Chip label={catName(categoryId) ?? 'Category'} icon="close" selected onPress={() => setCategoryId('')} /> : null}
          {tripId ? <Chip label={data.trips.find(t => t.id === tripId)?.name ?? 'Trip'} icon="close" selected onPress={() => setTripId('')} /> : null}
          {tagIds.length ? <Chip label={`${tagIds.length} tag${tagIds.length > 1 ? 's' : ''}`} icon="close" selected onPress={() => setTagIds([])} /> : null}
        </View>
      ) : null}
      {sections.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 50, gap: 8 }}>
          <Icon name="receipt" size={40} color={c.faint} />
          <T v="h3">{activeFilters || query ? 'Nothing matches' : 'No transactions here yet'}</T>
          <T v="small" center>Expenses, income, transfers, goal moves and debt payments all show up here.</T>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <NightGradient style={{ paddingTop: insets.top + 12, paddingHorizontal: space.page, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 }}>
          <T v="title" color="#FFFFFF">{selecting ? `${selected.length} selected` : 'History'}</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {selecting ? <GlassIcon name="close" label="Cancel selection" onPress={() => setSelected([])} /> : <>
              <GlassIcon name="magnify" label="Search" onPress={() => setSearchOpen(true)} />
              <GlassIcon name="calendar-month-outline" label="Calendar" onPress={() => router.push('/calendar')} />
              <View>
                <GlassIcon name="tune-variant" label="Filters and options" onPress={() => setFiltersOpen(true)} />
                {activeFilters ? <View style={{ position: 'absolute', top: 4, right: 4, width: 10, height: 10, borderRadius: 5, backgroundColor: c.amber }} /> : null}
              </View>
            </>}
          </View>
        </View>
      </NightGradient>

      <SectionList
        style={{ flex: 1, marginTop: -28, backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}
        sections={sections}
        keyExtractor={t => t.id}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 140 + insets.bottom }}
        renderSectionHeader={({ section }) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, marginBottom: 8, marginHorizontal: space.page + 4 }}>
            <T v="semi" color={c.muted}>{dayLabel(section.title)}{query || range.key === 'all' || range.key === 'ytd' ? `, ${section.title.slice(0, 4)}` : ''}</T>
            {section.net ? <T v="medium" color={section.net > 0 ? c.income : c.muted}>{peso(section.net, { sign: true })}</T> : null}
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <View style={{ marginHorizontal: space.page, backgroundColor: c.surface,
            borderTopLeftRadius: index === 0 ? radius.lg : 0, borderTopRightRadius: index === 0 ? radius.lg : 0,
            borderBottomLeftRadius: index === section.data.length - 1 ? radius.lg : 0, borderBottomRightRadius: index === section.data.length - 1 ? radius.lg : 0,
            borderTopWidth: index ? StyleSheet.hairlineWidth : 0, borderColor: c.line, overflow: 'hidden' }}>
            <TxRow t={item} selected={selecting ? selected.includes(item.id) : undefined}
              onPress={selecting ? () => toggleSel(item.id) : undefined} onLongPress={() => toggleSel(item.id)} />
          </View>
        )}
      />

      {selecting ? (
        <View style={{ position: 'absolute', left: space.page, right: space.page, bottom: insets.bottom + 96, flexDirection: 'row', gap: 8, backgroundColor: c.ink, borderRadius: radius.pill, padding: 6 }}>
          <Button small variant="dark" icon="shape-outline" label="Category" onPress={() => setBulk('category')} style={{ flex: 1, backgroundColor: c.ink, borderColor: c.ink }} />
          <Button small variant="dark" icon="tag-outline" label="Tag" onPress={() => setBulk('tag')} style={{ flex: 1, backgroundColor: c.ink, borderColor: c.ink }} />
          <Button small variant="primary" icon="trash-can-outline" label="Delete" onPress={deleteSelected} style={{ flex: 1 }} />
        </View>
      ) : null}

      <Sheet visible={bulk === 'category'} onClose={() => setBulk('none')} title={`Category for ${selected.length}`}>
        <Select label="Category" value={null} options={catOptions.slice(1)} placeholder="Choose a category"
          onChange={(v) => { const ids = selected; if (act(db => updateMany(db, ids, { categoryId: v }), `Updated ${ids.length}`)) { setBulk('none'); setSelected([]); } }} />
        <T v="small" style={{ marginTop: 10 }}>Only expenses and income use categories; transfers and goal moves ignore it.</T>
      </Sheet>
      <Sheet visible={bulk === 'tag'} onClose={() => setBulk('none')} title={`Tag ${selected.length}`}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {data.tags.map(tg => <Chip key={tg.id} label={tg.name} icon="tag" color={tg.color} onPress={() => {
            const ids = selected;
            const ok = act(db => { for (const t of data.transactions.filter(x => ids.includes(x.id))) {
              const list = safeJson<string[]>(t.tags, []);
              if (!list.includes(tg.id)) updateMany(db, [t.id], { tags: JSON.stringify([...list, tg.id]) });
            } }, `Tagged ${ids.length} with ${tg.name}`);
            if (ok) { setBulk('none'); setSelected([]); }
          }} />)}
          {!data.tags.length ? <T v="small">No tags yet. Create them under Plan → Tags.</T> : null}
        </View>
      </Sheet>

      <Sheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <View style={{ gap: 18 }}>
          <View style={{ gap: 8 }}>
            <T v="label">Date range</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {presets.map(p => <Chip key={p.key} label={p.label} selected={range.key === p.key} onPress={() => setRange(p)} />)}
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <DateField label="From" value={range.key === 'all' ? null : range.start} onChange={(v) => v && setRange({ key: 'custom', label: 'Custom range', start: v, end: v > range.end ? v : range.end })} />
              <DateField label="To" value={range.key === 'all' ? null : range.end} onChange={(v) => v && setRange({ key: 'custom', label: 'Custom range', start: v < range.start ? v : range.start, end: v })} />
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <T v="label">Type</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{KINDS.map(([k, l]) => <Chip key={k} label={l} selected={kind === k} onPress={() => setKind(k)} />)}</View>
          </View>
          <View style={{ gap: 8 }}>
            <T v="label">Account</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip label="All" selected={!accountId} onPress={() => setAccountId('')} />
              {data.accounts.filter(a => !a.archived).map(a => <Chip key={a.id} label={a.name} icon={a.icon} color={a.color} selected={accountId === a.id} onPress={() => setAccountId(a.id)} />)}
            </View>
          </View>
          <Select label="Category" value={categoryId} options={catOptions} onChange={setCategoryId} />
          {data.tags.length ? (
            <View style={{ gap: 8 }}>
              <T v="label">Tags</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {data.tags.map(tg => <Chip key={tg.id} label={tg.name} icon="tag" color={tg.color} selected={tagIds.includes(tg.id)}
                  onPress={() => setTagIds(s => s.includes(tg.id) ? s.filter(x => x !== tg.id) : [...s, tg.id])} />)}
              </View>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="secondary" label="Reset" onPress={() => { setKind('all'); setAccountId(''); setCategoryId(''); setTagIds([]); setTripId(''); setRange(presets[0]); }} style={{ flex: 1 }} />
            <Button label="Done" onPress={() => setFiltersOpen(false)} style={{ flex: 1 }} />
          </View>
          <Button variant="ghost" icon="delete-clock-outline" label={`Recently deleted${data.deleted.length ? ` (${data.deleted.length})` : ''}`}
            onPress={() => { setFiltersOpen(false); router.push('/deleted'); }} />
          <T v="small" center>Tip: press and hold a transaction to select several at once.</T>
        </View>
      </Sheet>
    </View>
  );
}
