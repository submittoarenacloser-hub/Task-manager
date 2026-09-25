// Показ уведомлений. Расписание считает schedule.js, здесь только доставка:
// в браузере — Notification API, в Android-версии — системные уведомления (native.js).

import { dueNotifications } from './schedule.js';
import { DAY } from './dates.js';
import { isNative, nativePermission, requestNativePermission, showNative } from './native.js';

const FIRED_KEY = 'vector.fired';

export function permission() {
  if (isNative) return nativePermission();
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission; // default | granted | denied
}

export async function requestPermission() {
  if (isNative) return requestNativePermission();
  if (permission() === 'unsupported') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return permission();
  }
}

function readFired() {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY)) ?? {};
  } catch {
    return {};
  }
}

function writeFired(fired) {
  const cutoff = Date.now() - 14 * DAY;
  const kept = Object.fromEntries(Object.entries(fired).filter(([, ts]) => ts > cutoff));
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(kept));
  } catch {
    // без журнала просто возможен повтор уведомления
  }
}

async function swRegistration() {
  try {
    return (await navigator.serviceWorker?.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

/**
 * Показать системное уведомление. Возвращает 'system', если получилось,
 * иначе 'inapp' — тогда приложение покажет его у себя.
 */
export async function show({ title, body, key, url = '#tasks' }) {
  if (isNative) return (await showNative({ title, body, key, url })) ? 'system' : 'inapp';
  if (permission() !== 'granted') return 'inapp';
  const options = {
    body,
    tag: key,
    lang: 'ru',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    data: { url },
  };
  const reg = await swRegistration();
  if (reg) {
    try {
      await reg.showNotification(title, options);
      return 'system';
    } catch {
      // упадём на обычный конструктор ниже
    }
  }
  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      location.hash = url;
      n.close();
    };
    return 'system';
  } catch {
    return 'inapp';
  }
}

/**
 * Периодически проверяет расписание и показывает то, что пора.
 * В браузере работает, пока вкладка или установленное приложение живы (в том числе в фоне).
 * В Android-версии уведомления по времени заранее стоят в системе, здесь остаётся
 * только сигнал ловушки: он зависит от того, что пользователь делает прямо сейчас.
 */
export function startNotifier({ getState, onInApp, interval = 20_000 }) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const fired = readFired();
      const due = dueNotifications(getState(), new Date(), fired, { only: isNative ? ['trap'] : null });
      for (const item of due) {
        fired[item.key] = Date.now();
        writeFired(fired);
        const via = await show(item);
        if (via === 'inapp') onInApp?.(item);
      }
    } finally {
      busy = false;
    }
  };
  tick();
  setInterval(tick, interval);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
  return tick;
}
