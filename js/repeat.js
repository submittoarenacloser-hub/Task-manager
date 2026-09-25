// Повторяющиеся задачи: правила повтора и расчёт следующей даты.
// Правило: { unit: 'day' | 'week' | 'month' | 'year', every: N, weekdays?: [0..6], anchor: 'YYYY-MM-DD' }.
// anchor — дата первого раза: от неё отсчитываются «через день» и число месяца.
// Даты — ключи дня 'YYYY-MM-DD'; считаем в UTC, чтобы переход на летнее время не сбивал дни.

import { plural } from './dates.js';

const DAY_MS = 86_400_000;

const toUtc = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUtc = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDaysKey = (key, n) => fromUtc(toUtc(key) + n * DAY_MS);
const weekdayOf = (key) => new Date(toUtc(key)).getUTCDay();
const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** Понедельник недели, в которую попадает день. */
const mondayOf = (key) => addDaysKey(key, -((weekdayOf(key) + 6) % 7));

/** Готовые варианты для выбора в карточке задачи. */
export const REPEAT_PRESETS = [
  { id: 'none', label: 'Не повторять' },
  { id: 'daily', label: 'Каждый день', rule: { unit: 'day', every: 1 } },
  { id: 'weekdays', label: 'По будням', rule: { unit: 'week', every: 1, weekdays: [1, 2, 3, 4, 5] } },
  { id: 'every2days', label: 'Через день', rule: { unit: 'day', every: 2 } },
  { id: 'weekly', label: 'Каждую неделю', rule: { unit: 'week', every: 1 } },
  { id: 'monthly', label: 'Каждый месяц', rule: { unit: 'month', every: 1 } },
  { id: 'quarterly', label: 'Раз в 3 месяца', rule: { unit: 'month', every: 3 } },
  { id: 'halfyear', label: 'Раз в полгода', rule: { unit: 'month', every: 6 } },
  { id: 'yearly', label: 'Каждый год', rule: { unit: 'year', every: 1 } },
  { id: 'custom', label: 'Своё…' },
];

export const REPEAT_UNITS = [
  { id: 'day', forms: ['день', 'дня', 'дней'] },
  { id: 'week', forms: ['неделю', 'недели', 'недель'] },
  { id: 'month', forms: ['месяц', 'месяца', 'месяцев'] },
  { id: 'year', forms: ['год', 'года', 'лет'] },
];

export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const WD_ON = ['по воскресеньям', 'по понедельникам', 'по вторникам', 'по средам', 'по четвергам', 'по пятницам', 'по субботам'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** Приводит правило к полному виду: целое every ≥ 1, дни недели для недельного повтора. */
export function normalizeRule(rule, anchor) {
  if (!rule) return null;
  const unit = ['day', 'week', 'month', 'year'].includes(rule.unit) ? rule.unit : 'day';
  const every = Math.max(1, Math.min(365, Math.round(Number(rule.every) || 1)));
  const out = { unit, every, anchor: rule.anchor ?? anchor };
  if (unit === 'week') {
    const days = [...new Set((rule.weekdays ?? []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
    out.weekdays = days.length ? days : [weekdayOf(out.anchor)];
  }
  return out;
}

/** Какой вариант из списка соответствует правилу (для выбора в форме). */
export function presetOf(rule) {
  if (!rule) return 'none';
  const same = (a = [], b = []) => a.length === b.length && a.every((x, i) => x === b[i]);
  for (const p of REPEAT_PRESETS) {
    if (!p.rule || p.rule.unit !== rule.unit || p.rule.every !== rule.every) continue;
    if (p.id === 'weekdays' && !same(rule.weekdays, p.rule.weekdays)) continue;
    if (p.id === 'weekly' && rule.weekdays?.length !== 1) continue;
    return p.id;
  }
  return 'custom';
}

/** Первая дата повтора строго после after. */
export function nextOccurrence(rule, after) {
  const r = normalizeRule(rule, after);
  const { anchor, every } = r;
  if (after < anchor) {
    // до первого раза: первый раз — это anchor, если он подходит под правило
    if (r.unit !== 'week' || r.weekdays.includes(weekdayOf(anchor))) return anchor;
  }

  if (r.unit === 'day') {
    const passed = Math.max(0, Math.floor((toUtc(after) - toUtc(anchor)) / DAY_MS));
    let k = Math.floor(passed / every);
    let key = addDaysKey(anchor, k * every);
    while (key <= after) key = addDaysKey(anchor, ++k * every);
    return key;
  }

  if (r.unit === 'week') {
    const baseMonday = mondayOf(anchor);
    let key = addDaysKey(after < anchor ? anchor : after, after < anchor ? 0 : 1);
    for (let i = 0; i < 7 * every * 2 + 7; i++, key = addDaysKey(key, 1)) {
      const weeks = Math.round((toUtc(mondayOf(key)) - toUtc(baseMonday)) / (7 * DAY_MS));
      if (weeks % every === 0 && r.weekdays.includes(weekdayOf(key))) return key;
    }
    return key;
  }

  // месяц и год: то же число месяца, а в коротком месяце — последний день
  const months = r.unit === 'year' ? every * 12 : every;
  const [ay, am, ad] = anchor.split('-').map(Number);
  for (let k = 0; k < 2400; k++) {
    const total = am - 1 + k * months;
    const y = ay + Math.floor(total / 12);
    const m = total % 12;
    const key = fromUtc(Date.UTC(y, m, Math.min(ad, daysInMonth(y, m))));
    if (key > after) return key;
  }
  return null;
}

/** Все даты повтора в отрезке [from, to]. */
export function occurrencesBetween(rule, from, to, limit = 60) {
  const out = [];
  let key = nextOccurrence(rule, addDaysKey(from, -1));
  while (key && key <= to && out.length < limit) {
    out.push(key);
    key = nextOccurrence(rule, key);
  }
  return out;
}

/** «каждый день», «по будням», «через день», «раз в 3 месяца, 25-го», «каждый год 25 сентября». */
export function describeRule(rule) {
  const r = normalizeRule(rule, rule?.anchor);
  if (!r) return '';
  const [, am, ad] = r.anchor.split('-').map(Number);
  const n = r.every;
  switch (r.unit) {
    case 'day':
      if (n === 1) return 'каждый день';
      if (n === 2) return 'через день';
      return `каждые ${n} ${plural(n, ['день', 'дня', 'дней'])}`;
    case 'week': {
      const days = WEEKDAY_ORDER.filter((d) => r.weekdays.includes(d));
      const list = days.length === 5 && !days.includes(0) && !days.includes(6)
        ? 'по будням'
        : days.length === 7
          ? 'каждый день'
          : days.length === 1
            ? WD_ON[days[0]]
            : `по ${days.map((d) => WD[d]).join(', ')}`;
      return n === 1 ? list : `${list}, раз в ${n} ${plural(n, ['неделю', 'недели', 'недель'])}`;
    }
    case 'month': {
      const day = `${ad}-го`;
      if (n === 1) return `каждый месяц, ${day}`;
      if (n === 6) return `раз в полгода, ${day}`;
      return `раз в ${n} ${plural(n, ['месяц', 'месяца', 'месяцев'])}, ${day}`;
    }
    case 'year':
      return `${n === 1 ? 'каждый год' : `раз в ${n} ${plural(n, ['год', 'года', 'лет'])}`} ${ad} ${MONTHS_GEN[am - 1]}`;
    default:
      return '';
  }
}

/** В какой горизонт положить задачу с датой: сегодня, неделя, месяц или потом. */
export function horizonForDate(dueKey, todayKey) {
  const days = Math.round((toUtc(dueKey) - toUtc(todayKey)) / DAY_MS);
  if (days <= 0) return 'today';
  if (days <= 6) return 'week';
  if (days <= 31) return 'month';
  return 'later';
}

export { addDaysKey };
