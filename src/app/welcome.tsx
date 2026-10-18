import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useData } from '../data/DataContext';
import { useTheme, radius } from '../theme';
import { Icon, IconBubble, T } from '../components/ui';
import { Logo } from '../components/Logo';
import { applySeed } from '../db/repo';
import { emptySetup, mySetup } from '../lib/seed';
import { pickBackupFile, restoreFromData } from '../lib/backup';

export default function Welcome() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { act, db, toast, reload } = useData();

  const choice = (icon: string, title: string, body: string, onPress: () => void, primary = false) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => ({ padding: 16, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: primary ? c.mango : c.navyLine, opacity: pressed ? 0.85 : 1 })}>
      <IconBubble icon={icon} color={primary ? '#0B1426' : c.mango} solid={primary} iconColor={primary ? c.mango : undefined} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="h3" color={primary ? c.onMango : c.navyText}>{title}</T>
        <T v="small" color={primary ? c.onMango : c.navyMuted}>{body}</T>
      </View>
      <Icon name="chevron-right" color={primary ? c.onMango : c.navyMuted} />
    </Pressable>
  );

  const restore = async () => {
    try {
      const data = await pickBackupFile();
      if (!data) return;
      const msg = restoreFromData(db, data);
      reload();
      toast(msg);
      router.replace('/');
    } catch (e) { toast(e instanceof Error ? e.message : 'Couldn’t restore that file.'); }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.navy }} contentContainerStyle={{ paddingTop: insets.top + 40, paddingBottom: insets.bottom + 30 }}>
      <View style={{ paddingHorizontal: 22, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Logo size={40} bg={c.navyLine} />
          <T v="h2" color={c.navyText}>Cynct</T>
        </View>
        <T v="display" color={c.navyText} style={{ fontSize: 40, lineHeight: 44, marginTop: 18 }}>Every centavo, in sync.</T>
        <T v="medium" color={c.navyMuted}>Spending, accounts, bills, debts and every goal you’re saving for, from a new phone to a house. Your data stays on this phone and works offline.</T>
      </View>
      <View style={{ alignItems: 'center', marginVertical: 28 }}>
        <Logo size={168} tile={false} />
      </View>
      <View style={{ paddingHorizontal: 22, gap: 12, marginTop: 6 }}>
        {choice('rocket-launch-outline', 'Load my starting setup', 'Wise, GoTyme, Maya, GCash, MariBank, Cash, house and emergency funds, bills, paydays and the ₱2.8M house goal.',
          () => { if (act(d => applySeed(d, mySetup()), 'Setup loaded. Set each account’s real balance.')) router.replace('/'); }, true)}
        {choice('backup-restore', 'Restore a backup', 'A Cynct backup (.json), including ones made when it was called Bahay.', restore)}
        {choice('plus-circle-outline', 'Start empty', 'Just the categories. Add your own accounts.', () => { if (act(d => applySeed(d, emptySetup()))) router.replace('/wallet'); })}
      </View>
    </ScrollView>
  );
}
