import React, { useEffect, useState } from 'react';
import { Animated, Image, Pressable, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import { money } from '../lib/currency';
import { useData, safeJson } from '../data/DataContext';
import { fonts, radius, useTheme, type Colors } from '../theme';
import { Button, Chip, Field, Icon, IconBubble, Row, Sheet, T, formatTime, type Option } from './ui';
import { dayLabel, peso, uid } from '../lib/money';
import { dueStatus, type UpcomingItem } from '../lib/ledger';
import { ACCOUNT_TYPES, SWATCHES } from '../lib/seed';
import type { Account, Category, Transaction } from '../db/schema';
import { upsert } from '../db/repo';

const upsertTag = upsert.tag;

// ---------- options ----------
export function useAccountOptions(includeId?: string | null, filter?: (a: Account) => boolean): Option[] {
  const { data, balances, fmt } = useData();
  return data.accounts
    .filter(a => (!a.archived || a.id === includeId) && (!filter || filter(a)))
    .map(a => ({ value: a.id, label: a.name, sub: `${ACCOUNT_TYPES[a.type] ?? a.type} · ${fmt(balances.get(a.id) ?? 0, a.id)}`, color: a.color, icon: a.icon }));
}

export function useCategoryOptions(kind: 'expense' | 'income', { allowNone = true, rootsOnly = false, excludeId }: { allowNone?: boolean; rootsOnly?: boolean; excludeId?: string } = {}): Option[] {
  const { data } = useData();
  const cats = data.categories.filter(c => c.kind === kind && !c.archived && c.id !== excludeId);
  const out: Option[] = allowNone ? [{ value: '', label: 'Uncategorized', icon: 'help-circle-outline' }] : [];
  for (const r of cats.filter(c => !c.parentId)) {
    out.push({ value: r.id, label: r.name, color: r.color, icon: r.icon });
    if (!rootsOnly) for (const ch of cats.filter(c => c.parentId === r.id)) out.push({ value: ch.id, label: ch.name, color: ch.color, icon: ch.icon, indent: true });
  }
  return out;
}

export function useCategoryName() {
  const { catById } = useData();
  return (id: string | null | undefined) => {
    if (!id) return null;
    const cat = catById.get(id);
    if (!cat) return null;
    const parent = cat.parentId ? catById.get(cat.parentId) : null;
    return parent ? `${parent.name} · ${cat.name}` : cat.name;
  };
}

// ---------- how each transaction type reads ----------
export interface TxLook { title: string; sub: string; icon: string; color: string; amount: string; amountColor: string }

export function txLook(t: Transaction, ctx: { accById: Map<string, Account>; catById: Map<string, Category>; goalName?: (id: string | null) => string | undefined; debtName?: (id: string | null) => string | undefined }, c: Colors): TxLook {
  const acc = t.accountId ? ctx.accById.get(t.accountId) : undefined;
  const to = t.toAccountId ? ctx.accById.get(t.toAccountId) : undefined;
  const cat = t.categoryId ? ctx.catById.get(t.categoryId) : undefined;
  const cur = acc?.currency ?? 'PHP';
  const pm = (v: number, o?: { sign?: boolean }) => money(v, cur, o);
  const fee = t.fee ? ` + ${pm(t.fee)} fee` : '';
  const crossTo = t.type === 'transfer' && to && to.currency !== cur ? ` → ${money(t.toAmount ?? t.amount, to.currency)}` : '';
  switch (t.type) {
    case 'transfer':
      return { title: t.note || `To ${to?.name ?? 'account'}`, sub: `${acc?.name ?? '?'} → ${to?.name ?? '?'}${fee}`, icon: 'swap-horizontal', color: c.info, amount: `${pm(t.amount)}${crossTo}`, amountColor: c.ink };
    case 'ext_out':
      return { title: t.note || `Sent to ${t.counterparty ?? 'someone'}`, sub: `${acc?.name ?? ''} → ${t.counterparty ?? 'outside'}${fee}`, icon: 'arrow-top-right', color: c.muted, amount: `−${pm(t.amount + (t.fee ?? 0))}`, amountColor: c.ink };
    case 'ext_in':
      return { title: t.note || `From ${t.counterparty ?? 'someone'}`, sub: `${t.counterparty ?? 'Outside'} → ${acc?.name ?? ''}${t.heldFor ? ` · held for ${t.heldFor}` : ''}`, icon: 'arrow-bottom-left', color: c.info, amount: `+${pm(t.amount)}`, amountColor: c.info };
    case 'adjust':
      return { title: 'Balance correction', sub: acc?.name ?? '', icon: 'scale-balance', color: c.muted, amount: pm(t.amount, { sign: true }), amountColor: t.amount > 0 ? c.income : c.ink };
    case 'goal_in':
      return { title: t.note || 'Added to goal', sub: `${acc?.name ?? ''} → ${ctx.goalName?.(t.goalId) ?? 'goal'}`, icon: 'flag-plus', color: c.mango, amount: pm(t.amount), amountColor: c.ink };
    case 'goal_out':
      return { title: t.note || 'Withdrew from goal', sub: `${ctx.goalName?.(t.goalId) ?? 'goal'} → ${acc?.name ?? ''}`, icon: 'flag-minus', color: c.mango, amount: pm(t.amount), amountColor: c.ink };
    case 'goal_interest':
      return { title: t.note || 'Interest', sub: ctx.goalName?.(t.goalId) ?? 'Goal', icon: 'percent', color: c.income, amount: `+${money(t.amount, 'PHP')}`, amountColor: c.income };
    case 'debt_in': case 'debt_out': {
      const name = ctx.debtName?.(t.debtId);
      return { title: t.note || 'Debt', sub: [name, acc?.name ?? 'Off wallet'].filter(Boolean).join(' · '), icon: t.type === 'debt_in' ? 'hand-coin' : 'hand-coin-outline', color: c.warn,
        amount: `${t.type === 'debt_in' ? '+' : '−'}${pm(t.amount)}`, amountColor: t.type === 'debt_in' ? c.info : c.ink };
    }
    default: {
      const isIncome = t.type === 'income';
      const parent = cat?.parentId ? ctx.catById.get(cat.parentId) : undefined;
      const catLabel = cat ? (parent ? `${parent.name} · ${cat.name}` : cat.name) : 'Uncategorized';
      return { title: t.note || cat?.name || (isIncome ? 'Income' : 'Expense'), sub: [t.note ? catLabel : null, acc?.name].filter(Boolean).join(' · '),
        icon: cat?.icon ?? (isIncome ? 'cash-plus' : 'cash-minus'), color: cat?.color ?? c.muted,
        amount: `${isIncome ? '+' : '−'}${pm(t.amount)}`, amountColor: isIncome ? c.income : c.ink };
    }
  }
}

export function useTxLook() {
  const { accById, catById, data } = useData();
  const { c } = useTheme();
  const goals = new Map(data.goals.map(g => [g.id, g.name]));
  const debts = new Map(data.debts.map(d => [d.id, d.person]));
  return (t: Transaction) => txLook(t, { accById, catById, goalName: id => (id ? goals.get(id) : undefined), debtName: id => (id ? debts.get(id) : undefined) }, c);
}

export function txRoute(t: Transaction): string {
  if (t.type === 'transfer' || t.type === 'ext_in' || t.type === 'ext_out') return `/transfer/${t.id}`;
  return `/tx/${t.id}`;
}

export function TxRow({ t, showDate, selected, onPress, onLongPress }: { t: Transaction; showDate?: boolean; selected?: boolean; onPress?: () => void; onLongPress?: () => void }) {
  const look = useTxLook()(t);
  const { c } = useTheme();
  const tagIds = safeJson<string[]>(t.tags, []);
  let sub = look.sub;
  if (showDate) sub = `${dayLabel(t.date)}${sub ? ' · ' + sub : ''}`;
  else if (t.time) sub = `${formatTime(t.time)}${sub ? ' · ' + sub : ''}`;
  return (
    <Row onPress={onPress ?? (() => router.push(txRoute(t) as never))} onLongPress={onLongPress} selected={selected}
      left={<IconBubble icon={look.icon} color={look.color} />} title={look.title}
      sub={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <T v="small" numberOfLines={1} style={{ flexShrink: 1 }}>{sub}</T>
        {t.photoUri ? <Icon name="paperclip" size={13} color={c.faint} /> : null}
        {tagIds.length ? <Icon name="tag-outline" size={13} color={c.faint} /> : null}
      </View>}
      right={<T v="num" color={look.amountColor}>{look.amount}</T>} />
  );
}

export function UpcomingRow({ item, onPay }: { item: UpcomingItem; onPay?: () => void }) {
  const { c } = useTheme();
  const status = dueStatus(item.date);
  const label = status === 'overdue' ? `Overdue · ${dayLabel(item.date)}` : status === 'today' ? 'Due today' : dayLabel(item.date);
  const color = item.direction === 'in' ? c.income : item.direction === 'move' ? c.info : c.spend;
  const icon = item.source === 'card' ? 'credit-card-clock-outline' : item.source === 'debt' ? 'hand-coin-outline' : item.source === 'installment' ? 'calendar-sync'
    : item.direction === 'in' ? 'arrow-down' : item.direction === 'move' ? 'swap-horizontal' : 'arrow-up';
  const route = item.source === 'recurring' ? `/recurring/${item.id}` : item.source === 'installment' ? `/installment/${item.id}` : item.source === 'debt' ? `/debt/${item.id}`
    : item.source === 'card' ? `/account/${item.id}` : `/tx/${item.id}`;
  return (
    <Row title={item.name} onPress={() => router.push(route as never)} left={<IconBubble icon={icon} color={color} />}
      sub={<View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 3 }}>
        <Chip label={label} tone={status === 'overdue' ? 'bad' : status === 'today' ? 'warn' : 'plain'} />
        {!item.expected ? <Chip label="Logged" tone="info" /> : null}
      </View>}
      right={<View style={{ alignItems: 'flex-end', gap: 6 }}>
        <T v="num" color={item.direction === 'in' ? c.income : c.ink}>{item.direction === 'in' ? '+' : item.direction === 'out' ? '−' : ''}{peso(item.amount)}</T>
        {onPay ? (
          <Pressable onPress={onPay} accessibilityRole="button" accessibilityLabel={`Mark ${item.name} done`} hitSlop={6}
            style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: c.mango, opacity: pressed ? 0.7 : 1 })}>
            <T v="semi" color={c.onMango} style={{ fontSize: 13 }}>{item.direction === 'in' ? 'Received' : item.direction === 'move' ? 'Done' : 'Paid'}</T>
          </Pressable>
        ) : null}
      </View>} />
  );
}

// ---------- category grid (entry screen) ----------
export function CategoryGrid({ kind, value, onChange }: { kind: 'expense' | 'income'; value: string; onChange: (id: string) => void }) {
  const { c } = useTheme();
  const { data } = useData();
  const [all, setAll] = useState(false);
  const roots = data.categories.filter(x => x.kind === kind && !x.archived && !x.parentId);
  const selected = data.categories.find(x => x.id === value);
  const selectedRoot = selected?.parentId ?? selected?.id;
  const children = selectedRoot ? data.categories.filter(x => x.parentId === selectedRoot && !x.archived) : [];
  const shown = all ? roots : roots.slice(0, 8);
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T v="label">Category</T>
        {roots.length > 8 ? <Pressable onPress={() => setAll(!all)} hitSlop={8}><T v="semi" style={{ fontSize: 14 }}>{all ? 'Show less' : `All ${roots.length}`}</T></Pressable> : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {shown.map(cat => {
          const on = selectedRoot === cat.id;
          return (
            <Pressable key={cat.id} onPress={() => onChange(on && value === cat.id ? '' : cat.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={cat.name}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 6, paddingRight: 14, paddingVertical: 6, borderRadius: radius.pill,
                backgroundColor: on ? cat.color : c.surface, borderWidth: 1, borderColor: on ? cat.color : c.line }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? 'rgba(11,20,38,0.12)' : cat.color + '22' }}>
                <Icon name={cat.icon} size={17} color={on ? '#0B1426' : cat.color} />
              </View>
              <T v="semi" color={on ? '#0B1426' : c.ink} style={{ fontSize: 14 }}>{cat.name}</T>
            </Pressable>
          );
        })}
        <Pressable onPress={() => router.push({ pathname: '/category/[id]', params: { id: 'new', kind } })} accessibilityRole="button" accessibilityLabel="Add category"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.faint }}>
          <Icon name="plus" size={17} color={c.muted} /><T v="semi" color={c.muted} style={{ fontSize: 14 }}>Add</T>
        </Pressable>
      </View>
      {children.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {children.map(ch => <Chip key={ch.id} label={ch.name} icon={ch.icon} color={ch.color} selected={value === ch.id} onPress={() => onChange(value === ch.id ? selectedRoot! : ch.id)} />)}
        </View>
      ) : null}
    </View>
  );
}

// ---------- photo attachment ----------
export async function keepPhoto(uri: string): Promise<string> {
  const dir = new Directory(Paths.document, 'photos');
  dir.create({ idempotent: true, intermediates: true });
  const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const dest = new File(dir, `${uid()}.${ext.length > 4 ? 'jpg' : ext}`);
  await new File(uri).copy(dest);
  return dest.uri;
}

export function PhotoField({ value, onChange, label = 'Photo' }: { value: string | null; onChange: (uri: string | null) => void; label?: string }) {
  const { c } = useTheme();
  const { toast } = useData();
  const pick = async (camera: boolean) => {
    try {
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { toast('Camera permission is off. Turn it on in Settings to take photos.'); return; }
      }
      const res = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (res.canceled || !res.assets?.[0]) return;
      onChange(await keepPhoto(res.assets[0].uri));
    } catch { toast('Couldn’t attach that photo.'); }
  };
  return (
    <View style={{ gap: 8 }}>
      <T v="label">{label}</T>
      {value ? (
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Image source={{ uri: value }} style={{ width: 84, height: 84, borderRadius: radius.md, backgroundColor: c.sunk }} />
          <Button small variant="danger" label="Remove" icon="close" onPress={() => onChange(null)} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button small variant="secondary" icon="camera-outline" label="Camera" onPress={() => pick(true)} />
          <Button small variant="secondary" icon="image-outline" label="Choose from photos" onPress={() => pick(false)} style={{ flex: 1 }} />
        </View>
      )}
    </View>
  );
}

// ---------- tags ----------
export function TagField({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { data, act } = useData();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  const create = () => {
    const n = name.trim();
    if (!n) return;
    const id = uid();
    if (act(db => upsertTag(db, { id, name: n, color: SWATCHES[data.tags.length % SWATCHES.length], createdAt: Date.now() }))) { onChange([...value, id]); setName(''); }
  };
  const chosen = data.tags.filter(t => value.includes(t.id));
  return (
    <View style={{ gap: 8 }}>
      <T v="label">Tags</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {chosen.map(t => <Chip key={t.id} label={t.name} icon="tag" color={t.color} selected onPress={() => toggle(t.id)} />)}
        <Chip label={chosen.length ? 'Edit' : 'Add tags'} icon="tag-plus-outline" onPress={() => setOpen(true)} />
      </View>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Tags">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {data.tags.map(t => <Chip key={t.id} label={t.name} icon="tag" color={t.color} selected={value.includes(t.id)} onPress={() => toggle(t.id)} />)}
          {!data.tags.length ? <T v="small">No tags yet. Create one below.</T> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
          <Field label="New tag" value={name} onChangeText={setName} placeholder="e.g. Bohol trip" onSubmitEditing={create} returnKeyType="done" maxLength={30} />
          <Button label="Add" small onPress={create} style={{ marginBottom: 6 }} />
        </View>
      </Sheet>
    </View>
  );
}

// ---------- the hills: goal progress, mango on navy ----------
export function Hills({ pct, label, fill, back, mid, ink, house }: { pct: number; label: string; fill: string; back: string; mid: string; ink: string; house: string }) {
  const base = 160, peak = 100;
  const mound = (x: number, w: number, h: number) => {
    const l = x - w / 2, r = x + w / 2, top = base - h;
    return `M${l} ${base}C${l + w * 0.08} ${top + h * 0.15} ${x - w * 0.28} ${top} ${x} ${top}C${x + w * 0.28} ${top} ${r - w * 0.08} ${top + h * 0.15} ${r} ${base}Z`;
  };
  const backPath = [[18, 90, 42], [118, 100, 58], [222, 120, 72], [322, 110, 64], [398, 90, 46]].map(m => mound(m[0], m[1], m[2])).join('');
  const front = [[64, 104, 62], [166, 132, peak], [272, 118, 80], [362, 104, 56]].map(m => mound(m[0], m[1], m[2])).join('');
  const p = Math.max(0, Math.min(1, pct));
  const fillY = base - Math.max(p, 0.015) * peak;
  return (
    <Svg width="100%" viewBox={`0 0 400 ${base}`} style={{ aspectRatio: 400 / base }} accessibilityLabel={`${Math.round(p * 100)} percent saved`}>
      <Defs><ClipPath id="front"><Path d={front} /></ClipPath></Defs>
      <Path d={backPath} fill={back} />
      <Path d={front} fill={mid} />
      <G clipPath="url(#front)"><Rect x={0} y={fillY} width={400} height={base - fillY + 1} fill={fill} /></G>
      {p > 0.02 && p < 0.98 ? <Line x1={0} x2={400} y1={fillY} y2={fillY} stroke={fill} strokeWidth={1.4} strokeDasharray="3 6" opacity={0.7} /> : null}
      <G transform={`translate(166 ${base - peak - 30})`}>
        {/* A flag on the summit: goals aren't only houses. */}
        <Rect x={-1.5} y={0} width={3} height={27} rx={1.5} fill={house} />
        <Path d="M1.5 1 L18 6.5 L1.5 12 Z" fill={house} />
      </G>
      <SvgText x={186} y={base - peak - 10} fill={ink} fontSize={13} fontFamily={fonts.bold}>{label}</SvgText>
    </Svg>
  );
}

// ---------- toast ----------
export function Toast() {
  const { toastState, dismissToast } = useData();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!toastState) return;
    Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const t = setTimeout(() => Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => dismissToast()), toastState.action ? 6000 : 2600);
    return () => clearTimeout(t);
  }, [toastState, anim, dismissToast]);
  if (!toastState) return null;
  return (
    <Animated.View pointerEvents="box-none" accessibilityLiveRegion="polite"
      style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 100, alignItems: 'center', opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
      <View style={{ backgroundColor: c.ink, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', gap: 16, alignItems: 'center', maxWidth: '100%' }}>
        <T v="semi" color={c.bg} style={{ flexShrink: 1 }}>{toastState.message}</T>
        {toastState.action ? (
          <Pressable onPress={() => { toastState.action!.run(); dismissToast(); }} hitSlop={10} accessibilityRole="button">
            <T v="semi" color={c.mango}>{toastState.action.label}</T>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}
