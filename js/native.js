// Android-версия (Capacitor): системные уведомления по расписанию, кнопка «Назад»,
// сохранение копии через «Поделиться». В браузере модуль ничего не делает.

import { plannedNotifications } from './schedule.js';

const cap = globalThis.Capacitor;
export const isNative = Boolean(cap?.isNativePlatform?.());

const Notifications = isNative ? globalThis.capacitorLocalNotifications?.LocalNotifications : null;
const App = isNative ? globalThis.capacitorApp?.App : null;
const Filesystem = isNative ? globalThis.capacitorFilesystemPluginCapacitor?.Filesystem : null;
const Share = isNative ? globalThis.capacitorShare?.Share : null;

const CHANNEL = 'vector';
const PERMISSION = { granted: 'granted', denied: 'denied', prompt: 'default', 'prompt-with-rationale': 'default' };

let permissionState = 'default';
let exactAlarms = 'granted';

/** default | granted | denied — как у Notification.permission в браузере. */
export const nativePermission = () => permissionState;
/** granted — уведомления приходят минута в минуту, иначе Android может их задержать. */
export const exactAlarmState = () => exactAlarms;

/** Системе нужен числовой id: получаем его из строкового ключа уведомления. */
export function notificationId(key) {
  let h = 0;
  for (const ch of key) h = (Math.imul(31, h) + ch.codePointAt(0)) | 0;
  return (Math.abs(h) % 2_000_000_000) + 1;
}

export async function refreshPermissions() {
  if (!Notifications) return;
  try {
    permissionState = PERMISSION[(await Notifications.checkPermissions()).display] ?? 'default';
  } catch {
    permissionState = 'default';
  }
  try {
    exactAlarms = (await Notifications.checkExactNotificationSetting()).exact_alarm ?? 'granted';
  } catch {
    // до Android 12 разрешение на точное время не нужно
    exactAlarms = 'granted';
  }
}

export async function requestNativePermission() {
  if (!Notifications) return 'unsupported';
  try {
    permissionState = PERMISSION[(await Notifications.requestPermissions()).display] ?? 'default';
  } catch {
    // оставляем прежнее значение
  }
  return permissionState;
}

export async function openExactAlarmSettings() {
  if (!Notifications) return;
  try {
    exactAlarms = (await Notifications.changeExactNotificationSetting()).exact_alarm ?? exactAlarms;
  } catch {
    // настройка недоступна на этой версии Android
  }
}

function toNative(n, at) {
  return {
    id: notificationId(n.key),
    title: n.title,
    body: n.body,
    largeBody: n.body,
    channelId: CHANNEL,
    smallIcon: 'ic_stat_vector',
    iconColor: '#0B7A55',
    extra: { url: n.url, key: n.key },
    ...(at ? { schedule: { at, allowWhileIdle: true } } : {}),
  };
}

/** Показать уведомление сразу. */
export async function showNative(n) {
  if (!Notifications || permissionState !== 'granted') return false;
  try {
    await Notifications.schedule({ notifications: [toNative(n)] });
    return true;
  } catch {
    return false;
  }
}

let getStateRef = () => null;
let syncTimer = null;
let lastSignature = '';

/**
 * Переставить расписание в системе на 7 дней вперёд.
 * Вызывается после каждого изменения данных: текст уведомлений собирается из текущих задач.
 */
export function scheduleSync() {
  if (!Notifications) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 800);
}

async function syncNow() {
  const state = getStateRef();
  if (!state) return;
  const planned = permissionState === 'granted' ? plannedNotifications(state, new Date(), 7).slice(0, 60) : [];
  const signature = JSON.stringify(planned.map((n) => [n.key, n.at.getTime(), n.title, n.body]));
  if (signature === lastSignature) return;
  try {
    const pending = await Notifications.getPending();
    if (pending.notifications.length) {
      await Notifications.cancel({ notifications: pending.notifications.map(({ id }) => ({ id })) });
    }
    if (planned.length) {
      await Notifications.schedule({ notifications: planned.map((n) => toNative(n, n.at)) });
    }
    lastSignature = signature;
  } catch {
    // попробуем снова при следующем изменении
  }
}

/** Свернуть приложение, не закрывая его (кнопка «Назад» на главном экране). */
export function minimize() {
  App?.minimizeApp?.();
}

/** Сохранить копию данных: файл во временную папку и системное меню «Поделиться». */
export async function shareBackup(fileName, json) {
  if (!Filesystem || !Share) return false;
  const { uri } = await Filesystem.writeFile({ path: fileName, data: json, directory: 'CACHE', encoding: 'utf8' });
  await Share.share({ title: 'Копия задач Вектора', files: [uri], dialogTitle: 'Сохранить копию' });
  return true;
}

export async function initNative({ getState, onOpenUrl, onResume, onBack }) {
  if (!isNative) return;
  getStateRef = getState;
  document.documentElement.classList.add('is-native');
  await refreshPermissions();
  try {
    await Notifications?.createChannel({
      id: CHANNEL,
      name: 'Напоминания',
      description: 'План на день, проверка курса, итоги и напоминания по задачам',
      importance: 4,
      visibility: 1,
      vibration: true,
    });
  } catch {
    // канал уже есть или Android старше 8.0
  }
  // Нажатие на уведомление, в том числе когда приложение было закрыто.
  Notifications?.addListener('localNotificationActionPerformed', (e) => {
    const url = e.notification?.extra?.url;
    if (url) onOpenUrl(url);
  });
  App?.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) return;
    refreshPermissions().then(() => {
      onResume();
      scheduleSync();
    });
  });
  App?.addListener('backButton', onBack);
  onResume(); // права уже известны — перерисовать настройки
  scheduleSync();
}
