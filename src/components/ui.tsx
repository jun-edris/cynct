import React, { useState } from 'react';
import {
  Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform,
  type TextInputProps, type TextStyle, type ViewStyle, type StyleProp,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { router } from 'expo-router';
import { fonts, radius, space, useTheme } from '../theme';
import { dayLabel, groupDigits, parseISO, peso, todayISO } from '../lib/money';
import { evaluate, hasOperator, pressWith } from '../lib/calc';
import { Squish, haptic, useSpring, SPRING } from './motion';

// ---------- icons ----------
export function Icon({ name, size = 22, color }: { name: string; size?: number; color: string }) {
  return <MaterialCommunityIcons name={name as React.ComponentProps<typeof MaterialCommunityIcons>['name']} size={size} color={color} />;
}

export function IconBubble({ icon, color, size = 40, solid, iconColor }: { icon: string; color: string; size?: number; solid?: boolean; iconColor?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.36, backgroundColor: solid ? color : color + '26', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={size * 0.52} color={iconColor ?? (solid ? '#0B1426' : color)} />
    </View>
  );
}

// ---------- text ----------
type TV = 'display' | 'title' | 'h2' | 'h3' | 'body' | 'medium' | 'semi' | 'small' | 'muted' | 'label' | 'num' | 'numLg';
export function T({ v = 'body', style, color, children, numberOfLines, center }: {
  v?: TV; style?: StyleProp<TextStyle>; color?: string; children: React.ReactNode; numberOfLines?: number; center?: boolean;
}) {
  const { c } = useTheme();
  const base: Record<TV, TextStyle> = {
    display: { fontFamily: fonts.numBlack, fontSize: 40, lineHeight: 46, color: c.ink, letterSpacing: -1.4, fontVariant: ['tabular-nums'] },
    title: { fontFamily: fonts.numBlack, fontSize: 28, lineHeight: 33, color: c.ink, letterSpacing: -0.85 },
    h2: { fontFamily: fonts.num, fontSize: 20, lineHeight: 25, color: c.ink, letterSpacing: -0.4 },
    h3: { fontFamily: fonts.semi, fontSize: 16, lineHeight: 21, color: c.ink },
    body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: c.ink },
    medium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, color: c.ink },
    semi: { fontFamily: fonts.semi, fontSize: 15, lineHeight: 21, color: c.ink },
    small: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: c.muted },
    muted: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: c.muted },
    label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 17, color: c.muted },
    num: { fontFamily: fonts.num, fontSize: 16, color: c.ink, fontVariant: ['tabular-nums'], letterSpacing: -0.3 },
    numLg: { fontFamily: fonts.numBlack, fontSize: 24, color: c.ink, fontVariant: ['tabular-nums'], letterSpacing: -0.8 },
  };
  return <Text numberOfLines={numberOfLines} style={[base[v], center && { textAlign: 'center' }, color ? { color } : null, style]}>{children}</Text>;
}

export function Money({ value, sign, v = 'num', color, style, cents }: { value: number; sign?: boolean; v?: TV; color?: string; style?: StyleProp<TextStyle>; cents?: boolean }) {
  return <T v={v} color={color} style={style}>{peso(value, { sign, cents: cents ?? 'auto' })}</T>;
}

// ---------- layout ----------
export function Screen({ title, subtitle, back, right, children, scroll = true, padBottom = 120, headerless, edge }: {
  title?: string; subtitle?: string; back?: boolean; right?: React.ReactNode; children: React.ReactNode; scroll?: boolean; padBottom?: number; headerless?: boolean;
  /** Content starts at the very top edge (for gradient headers that run under the status bar). */
  edge?: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const header = headerless ? null : (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: space.page, paddingBottom: 6, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
        {back ? <IconButton name="arrow-left" label="Back" onPress={close} filled /> : <View />}
        <View style={{ flexDirection: 'row', gap: 8 }}>{right}</View>
      </View>
      {title ? <T v="title" style={{ marginTop: back ? 8 : 0 }}>{title}</T> : null}
      {subtitle ? <T v="muted" style={{ marginTop: 4 }}>{subtitle}</T> : null}
    </View>
  );
  const body = scroll
    ? <ScrollView contentContainerStyle={{ paddingHorizontal: space.page, paddingBottom: padBottom + insets.bottom, paddingTop: edge ? 0 : 6 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    : <View style={{ flex: 1 }}>{children}</View>;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header}{body}
    </KeyboardAvoidingView>
  );
}

/**
 * Even columns that always fit: children are laid out in rows of `cols`, each cell flex: 1.
 * (Percentage widths plus a gap can overflow on some phones and fall back to one column.)
 */
export function Grid({ cols = 2, gap = 10, children }: { cols?: number; gap?: number; children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  return (
    <View style={{ gap }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap }}>
          {/* Cells take the row's height; tiles fill it with flexGrow. Never use height: '100%' here: Android resolves it against the screen. */}
          {row.map((child, i) => <View key={i} style={{ flex: 1, flexDirection: 'column' }}>{child}</View>)}
          {Array.from({ length: cols - row.length }, (_, i) => <View key={`pad${i}`} style={{ flex: 1 }} />)}
        </View>
      ))}
    </View>
  );
}

/** Pinned bottom bar for form screens. */
export function Footer({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingHorizontal: space.page, paddingTop: 12, paddingBottom: insets.bottom + 12, backgroundColor: c.bg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line, flexDirection: 'row', gap: 10 }}>
      {children}
    </View>
  );
}

export function Section({ title, aside, action, onAction, children, style }: {
  title: string; aside?: string; action?: string; onAction?: () => void; children?: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <View style={[{ marginTop: 26 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexShrink: 1 }}>
          <T v="h2">{title}</T>
          {aside ? <T v="small" numberOfLines={1}>{aside}</T> : null}
        </View>
        {action ? <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button"><T v="semi" color={c.ink} style={{ textDecorationLine: 'underline', textDecorationColor: c.mango }}>{action}</T></Pressable> : null}
      </View>
      {children}
    </View>
  );
}

export function Card({ children, style, onPress, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; padded?: boolean }) {
  const { c } = useTheme();
  const s = [{ backgroundColor: c.surface, borderRadius: radius.lg, padding: padded ? 16 : 0, overflow: 'hidden' as const }, style];
  if (!onPress) return <View style={s}>{children}</View>;
  const flat = StyleSheet.flatten(style) ?? {};
  return <Squish onPress={onPress} accessibilityRole="button" style={s} outer={layoutOf(flat)} scale={0.98} radius={(flat.borderRadius as number) ?? radius.lg} pressedRadius={radius.md}>{children}</Squish>;
}

/** Layout props belong on the outer pressable so a squishing card still sizes and spaces like a plain one. */
function layoutOf(st: ViewStyle): ViewStyle {
  const keys = ['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical', 'width', 'minWidth', 'maxWidth'] as const;
  const o: Record<string, unknown> = {};
  for (const k of keys) if (st[k] !== undefined) o[k] = st[k];
  return o as ViewStyle;
}

/** The bold color blocks: mango for the money that matters most, navy for weight. */
export function Block({ tone, children, style, onPress }: { tone: 'mango' | 'navy'; children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const { c } = useTheme();
  const s = [{ backgroundColor: tone === 'mango' ? c.mango : c.navy, borderRadius: radius.xl, padding: 20, overflow: 'hidden' as const }, style];
  if (!onPress) return <View style={s}>{children}</View>;
  return <Squish onPress={onPress} accessibilityRole="button" style={s} outer={layoutOf(StyleSheet.flatten(style) ?? {})} scale={0.98} radius={radius.xl} pressedRadius={radius.lg}>{children}</Squish>;
}

export function List({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <Card padded={false} style={style}>
      {items.map((child, i) => (
        <View key={i}>
          {i > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginLeft: 68 }} /> : null}
          {child}
        </View>
      ))}
    </Card>
  );
}

export function Row({ icon, iconColor, left, title, sub, right, onPress, onLongPress, chevron, selected }: {
  icon?: string; iconColor?: string; left?: React.ReactNode; title: string; sub?: React.ReactNode; right?: React.ReactNode;
  onPress?: () => void; onLongPress?: () => void; chevron?: boolean; selected?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={!onPress && !onLongPress} accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={selected !== undefined ? { selected } : undefined}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 12, minHeight: 64 },
        (pressed || selected) && { backgroundColor: selected ? c.mangoSoft : c.sunk }]}>
      {selected ? <IconBubble icon="check" color={c.mango} solid iconColor={c.onMango} /> : left ?? (icon ? <IconBubble icon={icon} color={iconColor ?? c.muted} /> : null)}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="semi" numberOfLines={1}>{title}</T>
        {sub ? (typeof sub === 'string' ? <T v="small" numberOfLines={1}>{sub}</T> : sub) : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron-right" size={20} color={c.faint} /> : null}
    </Pressable>
  );
}

export function Empty({ icon = 'inbox-outline', title, text, action, onAction }: { icon?: string; title: string; text?: string; action?: string; onAction?: () => void }) {
  const { c } = useTheme();
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 26, gap: 8 }}>
      <IconBubble icon={icon} color={c.mango} size={52} />
      <T v="h3" center style={{ marginTop: 6 }}>{title}</T>
      {text ? <T v="small" center style={{ maxWidth: 300 }}>{text}</T> : null}
      {action ? <Button label={action} onPress={onAction} small style={{ marginTop: 8 }} /> : null}
    </Card>
  );
}

export function Bar({ pct, color, over, height = 8, track }: { pct: number; color?: string; over?: boolean; height?: number; track?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track ?? c.sunk, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%`, height: '100%', borderRadius: height, backgroundColor: over ? c.spend : color ?? c.mango }} />
    </View>
  );
}

export function Ring({ pct, size = 64, stroke = 8, color, track, children }: { pct: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode }) {
  const { c } = useTheme();
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? c.sunk} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color ?? c.mango} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${circ * p} ${circ}`} />
      </Svg>
      {children}
    </View>
  );
}

export function Chip({ label, tone = 'plain', icon, selected, onPress, color }: {
  label: string; tone?: 'plain' | 'bad' | 'warn' | 'good' | 'info'; icon?: string; selected?: boolean; onPress?: () => void; color?: string;
}) {
  const { c } = useTheme();
  const map = { plain: [c.sunk, c.muted], bad: [c.spendSoft, c.spend], warn: [c.warnSoft, c.warn], good: [c.incomeSoft, c.income], info: [c.infoSoft, c.info] };
  const [bg, fg] = selected ? [c.ink, c.bg] : tone === 'plain' && onPress ? ['transparent', c.ink] : map[tone];
  const outlined = !selected && tone === 'plain' && !!onPress;
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: onPress ? 14 : 9, paddingVertical: onPress ? 8 : 3,
      borderWidth: outlined ? 1.5 : 0, borderColor: c.line }}>
      {icon ? <Icon name={icon} size={onPress ? 17 : 14} color={color && !selected ? color : fg} /> : null}
      <Text style={{ color: fg, fontFamily: onPress ? fonts.semi : fonts.medium, fontSize: onPress ? 14.5 : 12.5 }}>{label}</Text>
    </View>
  );
  if (!onPress) return body;
  return <Squish onPress={onPress} feedback="select" accessibilityRole="button" accessibilityState={{ selected: !!selected }} hitSlop={6} scale={0.94}>{body}</Squish>;
}

// ---------- controls ----------
export function Button({ label, onPress, variant = 'primary', small, icon, disabled, style }: {
  label: string; onPress?: () => void; variant?: 'primary' | 'accent' | 'secondary' | 'dark' | 'danger' | 'ghost'; small?: boolean; icon?: string; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const look = {
    primary: [c.ink, c.bg, c.ink], accent: [c.mango, c.onMango, c.mango], secondary: [c.surface, c.ink, c.line], dark: [c.ink, c.bg, c.ink],
    danger: [c.spendSoft, c.spend, c.spendSoft], ghost: ['transparent', c.ink, 'transparent'],
  }[variant];
  const h = small ? 44 : 56;
  return (
    // M3 Expressive: a pill that squares off a little while pressed, with a springy squish.
    <Squish onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
      outer={style} radius={h / 2} pressedRadius={small ? 12 : 16} scale={0.97}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: h,
        paddingHorizontal: small ? 16 : 22, backgroundColor: look[0], borderWidth: 1, borderColor: look[2], opacity: disabled ? 0.4 : 1 }}>
      {icon ? <Icon name={icon} size={small ? 18 : 20} color={look[1]} /> : null}
      <Text style={{ color: look[1], fontFamily: fonts.bold, fontSize: small ? 15 : 17 }}>{label}</Text>
    </Squish>
  );
}

export function IconButton({ name, onPress, label, color, filled, size = 48 }: { name: string; onPress: () => void; label: string; color?: string; filled?: boolean; size?: number }) {
  const { c } = useTheme();
  return (
    <Squish onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} radius={size / 2} pressedRadius={size * 0.3} scale={0.92}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', backgroundColor: filled ? c.surface : 'transparent' }}>
      <Icon name={name} color={color ?? c.ink} size={22} />
    </Squish>
  );
}

const NUMERIC = new Set(['decimal-pad', 'numbers-and-punctuation', 'number-pad', 'numeric']);

export function Field(props: TextInputProps & { label: string; hint?: string; error?: string; big?: boolean; decimals?: number; prefix?: string }) {
  // Every number field uses the app's own pad, so amounts never pop the phone keyboard.
  if (props.keyboardType && NUMERIC.has(props.keyboardType)) return <NumberField {...props} />;
  return <TextField {...props} />;
}

function TextField({ label, hint, error, style, big, decimals: _d, prefix: _p, ...props }: TextInputProps & { label: string; hint?: string; error?: string; big?: boolean; decimals?: number; prefix?: string }) {
  const { c } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    // Grow to share a row, but keep the natural height in a column (flex: 1 would collapse it and let the hint overlap what follows).
    <View style={{ gap: 7, flexGrow: 1, flexShrink: 1 }}>
      <T v="label">{label}</T>
      <TextInput placeholderTextColor={c.faint} accessibilityLabel={label} {...props}
        onFocus={(e) => { setFocus(true); props.onFocus?.(e); }} onBlur={(e) => { setFocus(false); props.onBlur?.(e); }}
        style={[{ minHeight: 52, borderRadius: radius.md, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.medium, fontSize: 16,
          backgroundColor: c.surface, color: c.ink, borderColor: error ? c.spend : focus ? c.mango : c.line },
          big && { fontFamily: fonts.numBlack, fontSize: 28, minHeight: 64 }, props.multiline && { minHeight: 96, textAlignVertical: 'top' }, style]} />
      {error ? <T v="small" color={c.spend}>{error}</T> : hint ? <T v="small">{hint}</T> : null}
    </View>
  );
}

/**
 * A number field that opens the in-app pad in a sheet. Amounts get thousands separators and a calculator;
 * 'numbers-and-punctuation' fields can go negative; 'number-pad' fields take whole digits only.
 * The value contract matches a text field: a string, with commas for amounts (the parsers ignore them).
 */
function NumberField({ label, hint, error, style, big, decimals = 2, prefix, value: raw, onChangeText, placeholder, maxLength, keyboardType, editable = true }:
  TextInputProps & { label: string; hint?: string; error?: string; big?: boolean; decimals?: number; prefix?: string }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const mode: PadMode = keyboardType === 'numbers-and-punctuation' ? 'signed' : keyboardType === 'number-pad' || keyboardType === 'numeric' ? 'integer' : 'calc';
  const value = raw ?? '';
  const [open, setOpen] = useState(false);
  const [expr, setExpr] = useState('');
  const [neg, setNeg] = useState(false);
  const shown = mode === 'integer' ? value : groupDigits(value, decimals);
  const emit = (e: string, n: boolean) => {
    if (mode === 'integer') { onChangeText?.(maxLength ? e.slice(0, maxLength) : e); return; }
    const plain = hasOperator(e) ? (e.replace(/[+−×÷]$/, '') ? String(evaluate(e)) : '') : e;
    onChangeText?.(plain ? groupDigits((n ? '-' : '') + plain, decimals) : '');
  };
  const start = () => {
    if (!editable) return;
    const t = value.replace(/,/g, '');
    setNeg(/^\s*[-−]/.test(t));
    setExpr(mode === 'integer' ? t : t.replace(/^\s*[-−]/, ''));
    setOpen(true);
  };
  const change = (e: string) => {
    const next = mode === 'integer' && maxLength ? e.slice(0, maxLength) : e;
    setExpr(next); emit(next, neg);
  };
  const done = () => { if (mode !== 'integer' && hasOperator(expr)) emit(expr, neg); setOpen(false); };
  const preview = mode !== 'integer' && hasOperator(expr) ? `= ${groupDigits(String(evaluate(expr)), decimals)}` : null;
  return (
    <View style={{ gap: 7, flexGrow: 1, flexShrink: 1 }}>
      <T v="label">{label}</T>
      <Pressable onPress={start} accessibilityRole="button" accessibilityLabel={`${label}: ${shown || placeholder || 'empty'}. Tap to edit`}
        style={[{ minHeight: big ? 64 : 52, borderRadius: radius.md, borderWidth: 1.5, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: c.surface, borderColor: error ? c.spend : open ? c.mango : c.line, opacity: editable ? 1 : 0.6 }, style as StyleProp<ViewStyle>]}>
        {prefix ? <Text style={{ fontFamily: fonts.num, fontSize: big ? 22 : 16, color: c.muted }}>{prefix}</Text> : null}
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: big ? fonts.numBlack : fonts.medium, fontSize: big ? 28 : 16, color: shown ? c.ink : c.faint, fontVariant: ['tabular-nums'] }}>
          {shown || placeholder || '0'}
        </Text>
        <Icon name="dialpad" size={18} color={open ? c.mango : c.faint} />
      </Pressable>
      {error ? <T v="small" color={c.spend}>{error}</T> : hint ? <T v="small">{hint}</T> : null}
      <Modal visible={open} transparent animationType="slide" onRequestClose={done} statusBarTranslucent>
        <Pressable style={{ flex: 1, backgroundColor: c.scrim }} onPress={done} accessibilityLabel="Done" />
        <View style={{ backgroundColor: c.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 14, paddingBottom: insets.bottom + 14, gap: 12 }}>
          <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: c.line }} />
          <View style={{ paddingHorizontal: 4, gap: 2 }}>
            <T v="label">{label}</T>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              {prefix ? <T v="numLg" color={c.muted}>{prefix}</T> : null}
              <T v="display" numberOfLines={1} style={{ flexShrink: 1 }} color={expr ? c.ink : c.faint}>
                {(neg ? '−' : '') + (expr ? (mode === 'integer' || hasOperator(expr) ? expr : groupDigits(expr, decimals)) : '0')}
              </T>
            </View>
            {preview ? <T v="medium" color={c.muted}>{preview}</T> : hint ? <T v="small">{hint}</T> : null}
          </View>
          <Keypad expr={expr} onChange={change} onDone={done} mode={mode} maxDecimals={decimals} negative={neg}
            onToggleSign={() => { const n = !neg; setNeg(n); emit(expr, n); }} />
          <Button label="Done" icon="check" onPress={done} />
        </View>
      </Modal>
    </View>
  );
}

/**
 * M3 Expressive connected button group: separate pills joined by a 2px gap. The selected one fills,
 * rounds fully and springs into place; the others keep tighter inner corners.
 */
export function Segmented<V extends string>({ value, options, onChange }: { value: V; options: [V, string, string?][]; onChange: (v: V) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16, backgroundColor: c.sunk }} accessibilityRole="radiogroup">
      {options.map(([v, label, icon], i) => (
        <SegItem key={v} on={v === value} label={label} icon={icon} first={i === 0} last={i === options.length - 1} onPress={() => { if (v !== value) { haptic('select'); onChange(v); } }} />
      ))}
    </View>
  );
}

function SegItem({ on, label, icon, first, last, onPress }: { on: boolean; label: string; icon?: string; first: boolean; last: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const k = useSpring(on ? 1 : 0, SPRING.fastSpatial);
  void first; void last;
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={label} style={{ flex: 1 }}>
      <Animated.View style={{ flexDirection: 'row', gap: 6, minHeight: 40, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 12,
        backgroundColor: on ? c.surface : 'transparent', opacity: k.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
        transform: [{ scale: k.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] }) }] }}>
        {icon ? <Icon name={icon} size={17} color={on ? c.ink : c.muted} /> : null}
        <Text numberOfLines={1} style={{ fontFamily: on ? fonts.semi : fonts.medium, fontSize: 14, color: on ? c.ink : c.muted }}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function Sheet({ visible, onClose, title, children, scroll = true }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; scroll?: boolean }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: c.scrim }} onPress={onClose} accessibilityLabel="Close" />
      <View style={{ backgroundColor: c.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '86%', paddingBottom: insets.bottom + 12 }}>
        <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: c.line, marginTop: 10 }} />
        {title ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.page, paddingTop: 10, paddingBottom: 6 }}>
            <T v="h2">{title}</T>
            <IconButton name="close" label="Close" onPress={onClose} filled size={40} />
          </View>
        ) : null}
        {scroll ? <ScrollView contentContainerStyle={{ paddingHorizontal: space.page, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          : <View style={{ paddingHorizontal: space.page }}>{children}</View>}
      </View>
    </Modal>
  );
}

export interface Option { value: string; label: string; sub?: string; color?: string; icon?: string; indent?: boolean }

export function Select({ label, value, options, onChange, placeholder = 'Choose', compact }: {
  label: string; value: string | null; options: Option[]; onChange: (v: string) => void; placeholder?: string; compact?: boolean;
}) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  return (
    <View style={{ gap: 7, flexGrow: 1, flexShrink: 1 }}>
      {!compact ? <T v="label">{label}</T> : null}
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${label}: ${current?.label ?? placeholder}`}
        style={{ minHeight: 52, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {current?.icon ? <IconBubble icon={current.icon} color={current.color ?? c.muted} size={32} /> : current?.color ? <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: current.color }} /> : null}
        <View style={{ flex: 1 }}>
          <T v="semi" numberOfLines={1} color={current ? c.ink : c.faint}>{current?.label ?? placeholder}</T>
          {current?.sub && !compact ? <T v="small" numberOfLines={1}>{current.sub}</T> : null}
        </View>
        <Icon name="chevron-down" size={20} color={c.muted} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <View style={{ gap: 4 }}>
          {options.map(o => (
            <Pressable key={o.value} onPress={() => { onChange(o.value); setOpen(false); }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: o.indent ? 34 : 6, paddingRight: 6, borderRadius: radius.md,
                backgroundColor: o.value === value ? c.mangoSoft : pressed ? c.sunk : 'transparent' })}>
              {o.icon ? <IconBubble icon={o.icon} color={o.color ?? c.muted} size={36} /> : o.color ? <View style={{ width: 14, height: 14, borderRadius: 5, backgroundColor: o.color }} /> : null}
              <View style={{ flex: 1 }}>
                <T v={o.value === value ? 'semi' : 'medium'}>{o.label}</T>
                {o.sub ? <T v="small">{o.sub}</T> : null}
              </View>
              {o.value === value ? <Icon name="check-circle" color={c.mango} /> : null}
            </Pressable>
          ))}
        </View>
      </Sheet>
    </View>
  );
}

function PickerBox({ label, text, icon, onPress, onClear, placeholder }: { label: string; text: string | null; icon: string; onPress: () => void; onClear?: () => void; placeholder: string }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 7, flexGrow: 1, flexShrink: 1 }}>
      <T v="label">{label}</T>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${text ?? placeholder}`}
        style={{ minHeight: 52, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name={icon} size={19} color={c.muted} />
        <T v="semi" color={text ? c.ink : c.faint} style={{ flex: 1 }} numberOfLines={1}>{text ?? placeholder}</T>
        {onClear && text ? <Pressable onPress={onClear} hitSlop={10} accessibilityLabel={`Clear ${label}`}><Icon name="close-circle" size={18} color={c.faint} /></Pressable> : null}
      </Pressable>
    </View>
  );
}

export function DateField({ label, value, onChange, allowClear, placeholder = 'Not set' }: { label: string; value: string | null; onChange: (v: string | null) => void; allowClear?: boolean; placeholder?: string }) {
  const open = () => DateTimePickerAndroid.open({ value: value ? parseISO(value) : new Date(), mode: 'date', onChange: (e, d) => { if (e.type === 'set' && d) onChange(todayISO(d)); } });
  return <PickerBox label={label} text={value ? dayLabel(value) : null} icon="calendar-blank" onPress={open} onClear={allowClear ? () => onChange(null) : undefined} placeholder={placeholder} />;
}

export function TimeField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string) => void }) {
  const open = () => {
    const d = new Date();
    if (value) { const [h, m] = value.split(':').map(Number); d.setHours(h, m); }
    DateTimePickerAndroid.open({ value: d, mode: 'time', is24Hour: false,
      onChange: (e, t) => { if (e.type === 'set' && t) onChange(`${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`); } });
  };
  return <PickerBox label={label} text={value ? formatTime(value) : null} icon="clock-outline" onPress={open} placeholder="Now" />;
}

export function formatTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <Pressable onPress={() => { haptic('select'); onChange(!value); }} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, minHeight: 48 }}>
      <View style={{ flex: 1 }}>
        <T v="semi">{label}</T>
        {hint ? <T v="small">{hint}</T> : null}
      </View>
      <Switch on={value} />
    </Pressable>
  );
}

/** M3 Expressive switch: the thumb grows and shows a check when on, and springs across. */
function Switch({ on }: { on: boolean }) {
  const { c } = useTheme();
  const k = useSpring(on ? 1 : 0, SPRING.fastSpatial);
  const size = k.interpolate({ inputRange: [0, 1], outputRange: [16, 24] });
  return (
    <View style={{ width: 52, height: 32, borderRadius: 16, backgroundColor: on ? c.mango : c.sunk, borderWidth: 2, borderColor: on ? c.mango : c.faint, justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', left: k.interpolate({ inputRange: [0, 1], outputRange: [6, 22] }), width: size, height: size, borderRadius: 12,
        backgroundColor: on ? c.onMango : c.faint, alignItems: 'center', justifyContent: 'center' }}>
        {on ? <Icon name="check" size={14} color={c.mango} /> : null}
      </Animated.View>
    </View>
  );
}

export function ColorPicker({ value, colors, onChange }: { value: string; colors: string[]; onChange: (v: string) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <T v="label">Color</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {colors.map(col => (
          <Pressable key={col} onPress={() => onChange(col)} accessibilityRole="radio" accessibilityState={{ selected: col === value }} accessibilityLabel={col}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: col, borderWidth: 3, borderColor: col === value ? c.ink : 'transparent' }} />
        ))}
      </View>
    </View>
  );
}

export function IconPicker({ value, icons, color, onChange }: { value: string; icons: string[]; color: string; onChange: (v: string) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <T v="label">Icon</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {icons.map(ic => (
          <Pressable key={ic} onPress={() => onChange(ic)} accessibilityRole="radio" accessibilityState={{ selected: ic === value }} accessibilityLabel={ic}
            style={{ width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: ic === value ? color : c.surface, borderWidth: 1, borderColor: c.line }}>
            <Icon name={ic} size={22} color={ic === value ? '#0B1426' : c.muted} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/**
 * The app's one number pad. `expr` is the raw expression ("120+80"); parent stores it.
 * mode: 'calc' amounts with + − × ÷ %, 'signed' adds a ± key for amounts that can be negative, 'integer' is digits only.
 */
export type PadMode = 'calc' | 'signed' | 'integer';
export function Keypad({ expr, onChange, onDone, mode = 'calc', maxDecimals = 2, negative, onToggleSign }: {
  expr: string; onChange: (v: string) => void; onDone?: () => void; mode?: PadMode; maxDecimals?: number; negative?: boolean; onToggleSign?: () => void;
}) {
  const { c } = useTheme();
  const rows = mode === 'integer'
    ? [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['⌫', '0', '=']]
    : [['AC', '⌫', mode === 'signed' ? '±' : '%', '÷'], ['7', '8', '9', '×'], ['4', '5', '6', '−'], ['1', '2', '3', '+'], ['00', '0', '.', '=']];
  const tap = (k: string) => {
    if (k === '=' && !hasOperator(expr)) { onDone?.(); return; }
    if (k === '±') { onToggleSign?.(); return; }
    if (mode === 'integer') { onChange(k === '⌫' ? expr.slice(0, -1) : expr + k); return; }
    onChange(pressWith(expr, k, maxDecimals));
  };
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
          {r.map(k => {
            const op = ['÷', '×', '−', '+', '%'].includes(k);
            const eq = k === '=';
            const danger = k === 'AC' || k === '⌫';
            const sign = k === '±';
            const bg = eq ? c.mango : op || (sign && negative) ? c.mangoSoft : danger || sign ? c.sunk : c.surface;
            const fg = eq ? c.onMango : op || (sign && negative) ? c.mango : danger ? c.spend : c.ink;
            return (
              <Squish key={k} accessibilityRole="button"
                accessibilityLabel={{ '⌫': 'Delete', AC: 'Clear', '−': 'Minus', '×': 'Times', '÷': 'Divide', '±': negative ? 'Make positive' : 'Make negative', '=': hasOperator(expr) ? 'Equals' : 'Done' }[k] ?? k}
                onPress={() => tap(k)} onLongPress={k === '⌫' ? () => onChange('') : undefined}
                outer={{ flex: 1 }} radius={radius.md} pressedRadius={27} scale={0.95}
                style={{ height: 56, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
                {k === '⌫' ? <Icon name="backspace-outline" color={fg} /> : eq && !hasOperator(expr) ? <Icon name="check" color={fg} size={26} />
                  : <Text style={{ fontFamily: fonts.num, fontSize: 22, color: fg }}>{k}</Text>}
              </Squish>
            );
          })}
        </View>
      ))}
    </View>
  );
}
export const keypadValue = (expr: string) => (expr ? evaluate(expr) : 0);

export function StatTile({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: radius.md, padding: 14, gap: 4 }}>
      <T v="label">{label}</T>
      <T v="numLg" color={color ?? c.ink} style={{ fontSize: 20 }} numberOfLines={1}>{value}</T>
      {sub ? <T v="small" numberOfLines={1}>{sub}</T> : null}
    </View>
  );
}

export function FormRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 12 }}>{children}</View>;
}

export function Gap({ h = 14 }: { h?: number }) { return <View style={{ height: h }} />; }

export function ErrorText({ text }: { text?: string | null }) {
  const { c } = useTheme();
  if (!text) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: c.spendSoft, borderRadius: radius.md, padding: 12 }} accessibilityLiveRegion="polite">
      <Icon name="alert-circle-outline" size={18} color={c.spend} />
      <T v="medium" color={c.spend} style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

export function Note({ icon = 'information-outline', children, tone = 'info' }: { icon?: string; children: React.ReactNode; tone?: 'info' | 'good' | 'warn' }) {
  const { c } = useTheme();
  const [bg, fg] = tone === 'good' ? [c.incomeSoft, c.income] : tone === 'warn' ? [c.warnSoft, c.warn] : [c.infoSoft, c.info];
  return (
    <View style={{ flexDirection: 'row', gap: 10, backgroundColor: bg, borderRadius: radius.md, padding: 14 }}>
      <Icon name={icon} size={20} color={fg} />
      <View style={{ flex: 1 }}>{typeof children === 'string' ? <T v="medium" color={c.inkSoft}>{children}</T> : children}</View>
    </View>
  );
}

export function close() { if (router.canGoBack()) router.back(); else router.replace('/'); }
export const pesoText = peso;
