// Модель задач: типы влияния, горизонты, создание и сортировка.

import { dayKey } from './dates.js';
import { nextOccurrence, horizonForDate } from './repeat.js';

/**
 * Три типа задач по влиянию на цель.
 * Прямая — сама по себе приносит деньги / двигает главную цель.
 * Косвенная — помогает, но результат от неё не сразу и не наверняка.
 * Шум — не двигает к цели; кандидат на отсечение или делегирование.
 */
export const IMPACTS = {
  direct: {
    id: 'direct',
    label: 'Прямая',
    plural: ['прямая', 'прямые', 'прямых'],
    hint: 'Напрямую приносит деньги или двигает цель',
    rank: 0,
  },
  indirect: {
    id: 'indirect',
    label: 'Косвенная',
    plural: ['косвенная', 'косвенные', 'косвенных'],
    hint: 'Помогает, но результат не сразу',
    rank: 1,
  },
  noise: {
    id: 'noise',
    label: 'Шум',
    plural: ['шум', 'шума', 'шума'],
    hint: 'Не двигает к цели: отсечь или делегировать',
    rank: 2,
  },
};
export const IMPACT_IDS = ['direct', 'indirect', 'noise'];

export const HORIZONS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'later', label: 'Потом' },
];
export const HORIZON_IDS = HORIZONS.map((h) => h.id);
export const horizonLabel = (id) => HORIZONS.find((h) => h.id === id)?.label ?? id;

/** Проверочный вопрос, который приложение задаёт на каждую задачу. */
export const FILTER_QUESTION = 'Если сделать только это, ты приблизишься к цели?';

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function createTask(fields, now = new Date()) {
  const horizon = HORIZON_IDS.includes(fields.horizon) ? fields.horizon : 'today';
  return {
    id: fields.id ?? uid(),
    title: String(fields.title ?? '').trim(),
    note: fields.note ?? '',
    impact: IMPACT_IDS.includes(fields.impact) ? fields.impact : 'indirect',
    horizon,
    status: 'open', // open | done | cut | delegated
    createdAt: new Date(now).toISOString(),
    doneAt: null,
    cutAt: null,
    delegatedTo: '',
    remindAt: null,
    // С какого дня задача стоит в «Сегодня» — чтобы видеть хвосты и зависшие задачи.
    todaySince: horizon === 'today' ? dayKey(now) : null,
    carryAck: null,
    order: 0,
    // Повтор: правило (repeat.js), дата ближайшего раза и время напоминания каждый раз.
    repeat: null,
    dueDate: null,
    remindTime: null,
    nextId: null,
  };
}

/** Изменение горизонта с учётом служебных полей. */
export function withHorizon(task, horizon, now = new Date()) {
  if (task.horizon === horizon) return task;
  return {
    ...task,
    horizon,
    todaySince: horizon === 'today' ? dayKey(now) : null,
    carryAck: null,
  };
}

export const isOpen = (t) => t.status === 'open';

/** Прямые выше косвенных, косвенные выше шума; внутри — ручной порядок, потом по дате. */
export function compareTasks(a, b) {
  return (
    IMPACTS[a.impact].rank - IMPACTS[b.impact].rank ||
    (a.order ?? 0) - (b.order ?? 0) ||
    String(a.createdAt).localeCompare(String(b.createdAt))
  );
}

export function openIn(tasks, horizon) {
  return tasks.filter((t) => isOpen(t) && t.horizon === horizon).sort(compareTasks);
}

export function countByImpact(list) {
  const out = { direct: 0, indirect: 0, noise: 0, total: 0 };
  for (const t of list) {
    out[t.impact] += 1;
    out.total += 1;
  }
  return out;
}

/** Главная задача дня: первая открытая прямая в «Сегодня». */
export function mainTaskOfDay(tasks) {
  return openIn(tasks, 'today').find((t) => t.impact === 'direct') ?? null;
}

const HORIZON_RANK = { today: 0, week: 1, month: 2, later: 3 };

/**
 * Следующий раз повторяющейся задачи после выполнения текущего.
 * Считается от более поздней из дат: запланированной или сегодняшней,
 * чтобы пропущенные дни не копились.
 */
export function nextInstance(task, now = new Date()) {
  const today = dayKey(now);
  const from = task.dueDate && task.dueDate > today ? task.dueDate : today;
  const dueDate = nextOccurrence(task.repeat, from);
  const horizon = horizonForDate(dueDate, today);
  return {
    ...task,
    id: uid(),
    status: 'open',
    createdAt: new Date(now).toISOString(),
    doneAt: null,
    cutAt: null,
    remindAt: null,
    dueDate,
    horizon,
    todaySince: horizon === 'today' ? dueDate : null,
    carryAck: null,
    nextId: null,
  };
}

/**
 * Задачи с датой сами приближаются к «Сегодня», когда подходит их день.
 * Только ближе, никогда не дальше: если задачу вручную подняли раньше срока, она остаётся.
 * Возвращает тот же массив, если ничего не изменилось.
 */
export function promoteDue(tasks, now = new Date()) {
  const today = dayKey(now);
  let changed = false;
  const out = tasks.map((t) => {
    if (!isOpen(t) || !t.dueDate) return t;
    const target = horizonForDate(t.dueDate, today);
    if (HORIZON_RANK[target] >= HORIZON_RANK[t.horizon]) return t;
    changed = true;
    return { ...t, horizon: target, todaySince: target === 'today' ? t.dueDate : null, carryAck: null };
  });
  return changed ? out : tasks;
}
