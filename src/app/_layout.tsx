import React, { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { Stack, SplashScreen, router } from 'expo-router';
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
import { useRefreshRates, type FxCache } from '../data/actions';
import { STALE_AFTER_MS } from '../lib/fxrates';
import { BASE } from '../lib/currency';
import { planReminders } from '../lib/reminders';
import { onOpen, readPrefs, schedule, setupNotifications } from '../lib/notify';

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

/** Keeps exchange rates fresh: on launch and whenever the app comes back, if they're older than a few hours. Silent when offline. */
function AutoRates() {
  const { data } = useData();
  const refresh = useRefreshRates();
  const latest = useRef({ data, refresh });
  const busy = useRef(false);
  const checkRef = useRef<() => void>(() => {});
  useEffect(() => { latest.current = { data, refresh }; }, [data, refresh]);
  useEffect(() => {
    const check = () => {
      const { data: d, refresh: run } = latest.current;
      if (busy.current || !d.settings.setupDone || d.settings.autoRates === false) return;
      const usesForeign = d.rates.length > 0 || d.accounts.some(a => !a.archived && a.currency !== BASE);
      const fx = d.settings.fx as FxCache | undefined;
      if (!usesForeign || (fx && Date.now() - fx.fetchedAt < STALE_AFTER_MS)) return;
      busy.current = true;
      run().catch(() => {}).finally(() => { busy.current = false; });
    };
    checkRef.current = check;
    check();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') check(); });
    return () => sub.remove();
  }, []);
  // Adding the first account in another currency fetches rates right away.
  const foreign = data.accounts.some(a => !a.archived && a.currency !== BASE);
  useEffect(() => { if (foreign) checkRef.current(); }, [foreign]);
  return null;
}

/** Keeps phone notifications in step with your data: re-plans whenever bills, debts or settings change. */
function Reminders() {
  const { data, balances, rtx, fmt } = useData();
  const prefs = readPrefs(data.settings);
  const plan = planReminders({ recurring: data.recurring, installments: data.installments, debts: data.debts, accounts: data.accounts, balances,
    goals: data.goals, txs: rtx, fmt }, prefs, todayISO());
  const key = JSON.stringify([prefs, plan.map(r => [r.key, r.date, r.title, r.body])]);
  const last = useRef('');
  const latest = useRef({ plan, prefs });
  useEffect(() => { latest.current = { plan, prefs }; });
  useEffect(() => {
    if (key === last.current) return;
    const t = setTimeout(() => {
      last.current = key;
      schedule(latest.current.plan, latest.current.prefs).catch(e => console.warn('reminders', e));
    }, 1500);
    return () => clearTimeout(t);
  }, [key]);
  useEffect(() => { setupNotifications(); return onOpen(url => router.push(url as never)); }, []);
  return null;
}

function Shell() {
  const { c, dark } = useTheme();
  const { db, data, rtx, reload, toast } = useData();

  useEffect(() => {
    if (!data.settings.setupDone) return;
    // Credit any monthly goal interest that came due while the app was closed.
    let credited = 0;
    for (const g of data.goals) {
      if (g.archived || g.annualRate <= 0) continue;
      const entries = pendingInterest({ ...g, annualRate: g.annualRate / 10_000, createdDate: todayISO(new Date(g.createdAt)) }, rtx);
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
      <AutoRates />
      <Reminders />
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
