// Turns the reminder plan into scheduled phone notifications. Everything is local: nothing leaves the phone.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { DEFAULT_PREFS, type Reminder, type ReminderPrefs } from './reminders';

const CHANNEL = 'reminders';
const supported = Platform.OS !== 'web';

export function readPrefs(settings: Record<string, unknown>): ReminderPrefs {
  return { ...DEFAULT_PREFS, ...((settings.notify as Partial<ReminderPrefs>) ?? {}) };
}

export function setupNotifications() {
  if (!supported) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  Notifications.setNotificationChannelAsync(CHANNEL, {
    // eslint-disable-next-line import/namespace -- re-exported enum the lint resolver can't follow
    name: 'Reminders', importance: Notifications.AndroidImportance.HIGH, lightColor: '#FFB020', vibrationPattern: [0, 200, 120, 200],
  }).catch(() => {});
}

/** Asks Android 13+ for permission. Returns false if the person said no. */
export async function askPermission(): Promise<boolean> {
  if (!supported) return false;
  const now = await Notifications.getPermissionsAsync();
  if (now.granted) return true;
  if (!now.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

const at = (date: string, time: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h || 0, min || 0, 0, 0);
};

/** Replaces every scheduled reminder with this plan. Android allows a limited number, so only the next 40 are kept. */
export async function schedule(plan: Reminder[], prefs: ReminderPrefs): Promise<number> {
  if (!supported) return 0;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!prefs.enabled) return 0;
  const [hour, minute] = prefs.time.split(':').map(Number);
  let n = 0;
  if (prefs.daily) {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Log today’s spending', body: 'Two taps keeps your streak and your numbers honest.', data: { url: '/tx/new' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: CHANNEL },
    });
    n++;
  }
  const now = Date.now();
  for (const r of plan) {
    const when = at(r.date, prefs.time);
    if (when.getTime() <= now + 60_000) continue;
    if (n >= 40) break;
    await Notifications.scheduleNotificationAsync({
      content: { title: r.title, body: r.body, data: { url: r.url } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL },
    });
    n++;
  }
  return n;
}

export async function sendTest() {
  if (!supported) return;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Cynct reminders are on', body: 'You’ll get bills, paydays and due dates at your chosen time.', data: { url: '/settings' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2, channelId: CHANNEL },
  });
}

/** Opens the screen a tapped notification points to. */
export function onOpen(go: (url: string) => void): () => void {
  if (!supported) return () => {};
  const last = Notifications.getLastNotificationResponse();
  const lastUrl = last?.notification.request.content.data?.url;
  if (typeof lastUrl === 'string') setTimeout(() => go(lastUrl), 300);
  const sub = Notifications.addNotificationResponseReceivedListener(r => {
    const url = r.notification.request.content.data?.url;
    if (typeof url === 'string') go(url);
  });
  return () => sub.remove();
}
