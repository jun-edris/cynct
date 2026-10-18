import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black } from '@expo-google-fonts/nunito';
import { Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { openDb, prepareDb } from '../db/client';
import { creditInterest, ensureDefaults, purgeOld, type DB } from '../db/repo';
import { DataProvider, useData } from '../data/DataContext';
import { fonts, useTheme } from '../theme';
import { LockGate } from '../components/LockGate';
import { Toast } from '../components/domain';
import { runDailyBackup } from '../lib/backup';
import { pendingInterest } from '../lib/ledger';
import { todayISO } from '../lib/money';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, fontError] = useFonts({
    [fonts.head]: Nunito_700Bold, [fonts.num]: Nunito_800ExtraBold, [fonts.numBlack]: Nunito_900Black,
    [fonts.body]: Figtree_400Regular, [fonts.medium]: Figtree_500Medium, [fonts.semi]: Figtree_600SemiBold, [fonts.bold]: Figtree_700Bold,
  });
  const [dbError, setDbError] = useState<string | null>(null);
  const [db, setDb] = useState<DB | null>(null);
  useEffect(() => {
    let cancelled = false;
    prepareDb()
      .then(() => {
        if (cancelled) return;
        const opened = openDb().db;
        // housekeeping that must happen before the first screen reads data
        ensureDefaults(opened);
        purgeOld(opened);
        setDb(opened);
      })
      .catch(e => { if (!cancelled) setDbError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { if (loaded || fontError || dbError) SplashScreen.hideAsync().catch(() => {}); }, [loaded, fontError, dbError]);

  // Plain Text here: the theme needs the database, which is what failed.
  if (dbError) return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 8, backgroundColor: '#0B1426' }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: '#F4F1E8' }}>Couldn’t open the database.</Text>
      <Text style={{ fontSize: 14, color: '#97A3BC' }}>{dbError}</Text>
    </View>
  );
  if (!db || (!loaded && !fontError)) return null;

  return (
    <SafeAreaProvider>
      <DataProvider db={db}>
        <Shell />
      </DataProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const { c, dark } = useTheme();
  const { db, data, reload, toast } = useData();

  useEffect(() => {
    if (!data.settings.setupDone) return;
    // Credit any monthly goal interest that came due while the app was closed.
    let credited = 0;
    for (const g of data.goals) {
      if (g.archived || g.annualRate <= 0) continue;
      const entries = pendingInterest({ ...g, annualRate: g.annualRate / 10_000, createdDate: todayISO(new Date(g.createdAt)) }, data.transactions);
      if (entries.length) { creditInterest(db, g, entries); credited += entries.reduce((s, e) => s + e.amount, 0); }
    }
    if (credited) reload();
    runDailyBackup(db, data.settings)
      .then(r => { if (r.wrote) reload(); if (r.folderError) toast(r.folderError); })
      .catch(e => console.warn('daily backup failed', e));
    // run once per launch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.settings.setupDone]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <LockGate>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'slide_from_right' }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="welcome" />
          <Stack.Screen name="tx/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="transfer/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="quick" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </Stack>
        <Toast />
      </LockGate>
    </View>
  );
}
