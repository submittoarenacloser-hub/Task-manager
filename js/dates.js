// Работа с датами в локальном времени пользователя. Без зависимостей.

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const pad = (n) => String(n).padStart(2, '0');

/** Ключ дня вида 2026-09-25 (локальная дата). */
export function dayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfDay(date = new Date()) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(date, n) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

/** Понедельник текущей недели, 00:00. */
export function startOfWeek(date = new Date()) {
  const d = startOfDay(date);
  const shift = (d.getDay() + 6) % 7;
  return addDays(d, -shift);
}

/** Сколько календарных дней между двумя ключами дня (b - a). */
export function daysBetweenKeys(a, b) {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / DAY);
}

/** 'HH:MM' → дата того же дня в это время. */
export function atTime(date, hhmm) {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  const d = startOfDay(date);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

export function formatTime(date) {
  const d = new Date(date);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
export const WEEKDAYS_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
/** «в понедельник», «во вторник»… */
export const WEEKDAYS_ON = ['в воскресенье', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу'];
const MONTHS_GEN = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function weekdayShort(date) {
  return WEEKDAYS_SHORT[new Date(date).getDay()];
}

/** «сегодня 14:00», «завтра 09:00», «вчера 18:30», «12 окт 14:00». */
export function formatWhen(date, now = new Date()) {
  const d = new Date(date);
  const diff = daysBetweenKeys(dayKey(now), dayKey(d));
  const time = formatTime(d);
  if (diff === 0) return `сегодня ${time}`;
  if (diff === 1) return `завтра ${time}`;
  if (diff === -1) return `вчера ${time}`;
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${time}`;
}

/** Значение для <input type="datetime-local">. */
export function toLocalInput(date) {
  const d = new Date(date);
  return `${dayKey(d)}T${formatTime(d)}`;
}

/** «1 ч 25 мин», «40 мин», «0 мин». */
export function formatDuration(minutes) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h && rest) return `${h} ч ${rest} мин`;
  if (h) return `${h} ч`;
  return `${rest} мин`;
}

/** Русское склонение: plural(3, ['задача', 'задачи', 'задач']). */
export function plural(n, forms) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
