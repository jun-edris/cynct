import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';
import { AppState, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useData } from '../data/DataContext';
import { useTheme } from '../theme';
import { Button, T } from './ui';

const RELOCK_AFTER_MS = 60_000;

/** Covers the app until the fingerprint/face/PIN check passes, when the lock is on. */
export function LockGate({ children }: { children: React.ReactNode }) {
  const { data } = useData();
  const { c } = useTheme();
  const enabled = data.settings.lockEnabled === true;
  const [locked, setLocked] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const backgroundedAt = useRef<number | null>(null);
  const busy = useRef(false);

  const unlock = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Cynct', cancelLabel: 'Cancel' });
      if (res.success) setLocked(false);
      else if (res.error !== 'user_cancel' && res.error !== 'system_cancel') setError('Didn’t work. Try again.');
    } finally { busy.current = false; }
  }, []);

  useEffect(() => { if (locked && enabled) unlock(); }, [locked, enabled, unlock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (!enabled) return;
      if (state === 'background') backgroundedAt.current = Date.now();
      if (state === 'active' && backgroundedAt.current && Date.now() - backgroundedAt.current > RELOCK_AFTER_MS) setLocked(true);
    });
    return () => sub.remove();
  }, [enabled]);

  if (!enabled || !locked) return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: c.navy, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
      <Logo size={84} />
      <T v="title" color={c.navyText}>Cynct is locked</T>
      {error ? <T v="small" color={c.spend}>{error}</T> : null}
      <Button label="Unlock" icon="fingerprint" onPress={unlock} />
    </View>
  );
}

export async function canUseBiometrics(): Promise<string | null> {
  const hw = await LocalAuthentication.hasHardwareAsync();
  if (!hw) return 'This phone has no fingerprint or face sensor.';
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level === LocalAuthentication.SecurityLevel.NONE) return 'Set up a screen lock or fingerprint in your phone settings first.';
  return null;
}
