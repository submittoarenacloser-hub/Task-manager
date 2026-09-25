// Состояние приложения: хранение в localStorage, действия, подписка на изменения.

import { createTask, withHorizon, uid, nextInstance, promoteDue } from './model.js';
import { nextOccurrence, horizonForDate, addDaysKey } from './repeat.js';
import { DEFAULT_LIMITS } from './rules.js';
import { DEFAULT_NOTIFY } from './schedule.js';
import {
  startFocus,
  pauseFocus,
  resumeFocus,
  skipSegment,
  focusMinutesDone,
  normalizeFocus,
  buildPlan,
  DEFAULT_POMODORO,
} from './focus.js';
import { addDays, dayKey, atTime, startOfDay, MINUTE } from './dates.js';

const KEY = 'vector.state.v1';
const SCHEMA = 1;

export function defaultState() {
  return {
    schema: SCHEMA,
    onboarded: false,
    goal: { title: '', metric: '' },
    tasks: [],
    sessions: [], // завершённые фокус-сессии: { taskId, impact, minutes, endedAt }
    focus: null,
    settings: {
      limits: { ...DEFAULT_LIMITS },
      notify: structuredClone(DEFAULT_NOTIFY),
      // Помодоро: длина круга фокуса, перерыва и общее время (0 — один круг), в минутах
      pomodoro: { ...DEFAULT_POMODORO },
    },
  };
}

/** Дополняет сохранённые данные значениями по умолчанию (для старых версий и импорта). */
export function normalize(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const { focusMinutes, ...settings } = raw.settings ?? {};
  const notify = settings.notify ?? {};
  return {
    ...base,
    ...raw,
    schema: SCHEMA,
    goal: { ...base.goal, ...raw.goal },
    tasks: Array.isArray(raw.tasks) ? raw.tasks.filter((t) => t && t.id && t.title) : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    focus: normalizeFocus(raw.focus),
    settings: {
      ...base.settings,
      ...settings,
      limits: { ...base.settings.limits, ...settings.limits },
      // прежняя настройка «длина фокус-сессии» становится длиной круга
      pomodoro: { ...base.settings.pomodoro, ...(focusMinutes ? { focus: focusMinutes } : {}), ...settings.pomodoro },
      notify: {
        ...base.settings.notify,
        ...notify,
        morning: { ...base.settings.notify.morning, ...notify.morning },
        midday: { ...base.settings.notify.midday, ...notify.midday },
        evening: { ...base.settings.notify.evening, ...notify.evening },
        weekly: { ...base.settings.notify.weekly, ...notify.weekly },
      },
    },
  };
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const s = normalize(JSON.parse(raw));
    return { ...s, tasks: promoteDue(s.tasks) };
  } catch {
    return defaultState();
  }
}

function write(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Хранилище недоступно (приватный режим) — работаем в памяти.
  }
}

let state = read();
const listeners = new Set();

export const getState = () => state;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** silent — сохранить без перерисовки (правка поля, которое пользователь ещё редактирует). */
function commit(next, { silent = false } = {}) {
  state = next;
  write(state);
  for (const fn of listeners) fn(state, { silent });
}

const nowIso = () => new Date().toISOString();

function patchTask(id, fn) {
  commit({ ...state, tasks: state.tasks.map((t) => (t.id === id ? fn(t) : t)) });
}

export const findTask = (id) => state.tasks.find((t) => t.id === id) ?? null;

// ——— цель и настройки ———

export function setGoal(goal, opts) {
  commit({ ...state, goal: { ...state.goal, ...goal }, onboarded: true }, opts);
}

export function updateSettings(fn, opts) {
  commit({ ...state, settings: fn(structuredClone(state.settings)) }, opts);
}

// ——— задачи ———

export function addTask(fields) {
  const task = createTask(fields);
  commit({ ...state, tasks: [...state.tasks, task] });
  return task;
}

export function updateTask(id, patch) {
  patchTask(id, (t) => {
    const moved = patch.horizon ? withHorizon(t, patch.horizon) : t;
    const { horizon, ...rest } = patch;
    return { ...moved, ...rest };
  });
}

/**
 * Отметить задачу сделанной или вернуть в работу.
 * У повторяющейся задачи при выполнении сразу появляется следующий раз; его возвращает функция.
 */
export function toggleDone(id) {
  const task = findTask(id);
  if (!task) return null;
  if (task.status === 'done') {
    // Вернули в работу: следующий раз, созданный при выполнении, больше не нужен, если его не трогали.
    const tasks = state.tasks
      .filter((t) => !(task.nextId && t.id === task.nextId && t.status === 'open'))
      .map((t) => (t.id === id ? { ...t, status: 'open', doneAt: null, nextId: null } : t));
    commit({ ...state, tasks });
    return null;
  }
  const next = task.repeat ? nextInstance(task) : null;
  const tasks = state.tasks.map((t) =>
    t.id === id ? { ...t, status: 'done', doneAt: nowIso(), nextId: next?.id ?? null } : t,
  );
  commit({ ...state, tasks: next ? [...tasks, next] : tasks });
  return next;
}

/** Пропустить этот раз повторяющейся задачи: она переезжает на следующую дату. */
export function skipOccurrence(id) {
  const task = findTask(id);
  if (!task?.repeat) return null;
  const today = dayKey();
  const dueDate = nextOccurrence(task.repeat, task.dueDate && task.dueDate > today ? task.dueDate : today);
  const horizon = horizonForDate(dueDate, today);
  patchTask(id, (t) => ({
    ...t,
    dueDate,
    horizon,
    todaySince: horizon === 'today' ? dueDate : null,
    carryAck: null,
  }));
  return dueDate;
}

/** Новый день: задачи с датой переезжают ближе к «Сегодня». */
export function refreshDue() {
  const tasks = promoteDue(state.tasks);
  if (tasks !== state.tasks) commit({ ...state, tasks });
}

export function cutTask(id) {
  patchTask(id, (t) => ({ ...t, status: 'cut', cutAt: nowIso() }));
}

export function delegateTask(id, who) {
  patchTask(id, (t) => ({ ...t, status: 'delegated', delegatedTo: who.trim(), cutAt: nowIso() }));
}

export function restoreTask(id) {
  patchTask(id, (t) => ({ ...t, status: 'open', cutAt: null, doneAt: null }));
}

export function deleteTask(id) {
  commit({ ...state, tasks: state.tasks.filter((t) => t.id !== id) });
}

/** Поднять задачу наверх внутри её типа. */
export function raiseTask(id) {
  const task = findTask(id);
  if (!task) return;
  const min = Math.min(0, ...state.tasks.filter((t) => t.horizon === task.horizon).map((t) => t.order ?? 0));
  patchTask(id, (t) => ({ ...t, order: min - 1 }));
}

/** «Оставить на сегодня» для хвоста со вчера. */
export function ackCarry(ids) {
  const today = dayKey();
  const set = new Set(ids);
  commit({ ...state, tasks: state.tasks.map((t) => (set.has(t.id) ? { ...t, carryAck: today } : t)) });
}

// ——— фокус-сессия ———

/** Начать сессию по настройкам Помодоро (они же запоминаются на следующий раз). */
export function beginFocus(taskId, pomodoro = state.settings.pomodoro) {
  commit({
    ...state,
    settings: { ...state.settings, pomodoro: { ...pomodoro } },
    focus: startFocus(taskId, buildPlan(pomodoro)),
  });
}

/** Пропустить перерыв или закончить круг раньше. */
export function skipFocusSegment() {
  commit({ ...state, focus: skipSegment(state.focus) });
}

/** Запомнить выбор длительностей без запуска таймера. */
export function setPomodoro(pomodoro) {
  commit({ ...state, settings: { ...state.settings, pomodoro: { ...pomodoro } } });
}

export function pauseCurrentFocus() {
  commit({ ...state, focus: pauseFocus(state.focus) });
}

export function resumeCurrentFocus() {
  commit({ ...state, focus: resumeFocus(state.focus) });
}

/** Завершить сессию и записать потраченные минуты (если набралась хотя бы минута). */
/**
 * Завершить сессию и записать минуты фокуса без перерывов (если набралась хотя бы минута).
 * markDone — ещё и отметить задачу сделанной (у повторяющейся появится следующий раз).
 */
export function endFocus({ markDone = false } = {}) {
  const f = state.focus;
  if (!f) return null;
  const task = findTask(f.taskId);
  const minutes = focusMinutesDone(f);
  const sessions = minutes >= 1 && task
    ? [...state.sessions, { taskId: f.taskId, impact: task.impact, minutes, endedAt: nowIso() }]
    : state.sessions;
  commit({ ...state, focus: null, sessions: sessions.slice(-500) });
  return markDone && task?.status === 'open' ? toggleDone(f.taskId) : null;
}

// ——— данные ———

export function exportData() {
  return JSON.stringify({ app: 'vector', exportedAt: nowIso(), ...state }, null, 2);
}

export function importData(json) {
  const parsed = JSON.parse(json);
  if (!parsed || !Array.isArray(parsed.tasks)) throw new Error('В файле нет списка задач.');
  commit({ ...normalize(parsed), onboarded: true });
}

export function resetAll() {
  commit(defaultState());
}

export function markOnboarded() {
  commit({ ...state, onboarded: true });
}

/** Пример: цель и задачи, чтобы увидеть приложение в работе. */
export function loadSample() {
  const now = new Date();
  const at = (days, time) => atTime(addDays(now, days), time).toISOString();
  // Сегодняшние отметки — всегда в прошлом относительно текущего момента.
  const ago = (minutes) => new Date(Math.max(startOfDay(now).getTime(), now - minutes * MINUTE)).toISOString();
  const t = (title, impact, horizon, extra = {}) => ({
    ...createTask({ title, impact, horizon }, now),
    id: uid(),
    ...extra,
  });
  const today = dayKey(now);
  const quarterDay = dayKey(new Date(now.getFullYear(), now.getMonth() + 1, 25));
  // Повторяющаяся задача: первый раз — ближайший подходящий день начиная с start.
  const repeating = (rule, start, remindTime) => {
    const repeat = { ...rule, anchor: start };
    const dueDate = nextOccurrence(repeat, addDaysKey(start, -1));
    const horizon = horizonForDate(dueDate, today);
    return { repeat, dueDate, remindTime, horizon, todaySince: horizon === 'today' ? dueDate : null };
  };
  const done = (title, impact, days, time) =>
    t(title, impact, 'today', {
      status: 'done',
      doneAt: days === 0 ? ago(time) : at(-days, time),
      createdAt: at(-days - 1, '10:00'),
    });

  const tasks = [
    t('Позвонить пяти тёплым клиентам из списка', 'direct', 'today', { todaySince: dayKey(addDays(now, -2)), carryAck: dayKey(now) }),
    t('Отправить коммерческое предложение «Северу»', 'direct', 'today'),
    t('Обновить шаблон презентации', 'indirect', 'today'),
    t('Провести три демо-встречи', 'direct', 'week'),
    t('Запустить рекламу на новый оффер', 'direct', 'week'),
    t('Посмотреть вебинар про воронки', 'indirect', 'week'),
    t('Планёрка с командой', 'indirect', 'today', repeating({ unit: 'week', every: 1, weekdays: [1, 2, 3, 4, 5] }, today, '10:00')),
    t('Отчёт и налоги за квартал', 'direct', 'later', repeating({ unit: 'month', every: 3 }, quarterDay, '09:00')),
    t('Переделать логотип', 'indirect', 'month'),
    t('Собрать отзывы клиентов для сайта', 'indirect', 'month'),
    t('Разобрать старые письма в почте', 'noise', 'later'),
    t('Сменить тему оформления в редакторе', 'noise', 'later'),
    t('Ответить во всех чатах, где отметили', 'noise', 'later'),
    done('Созвон с клиентом по продлению', 'direct', 0, 95),
    done('Настроить фильтры в почте', 'noise', 0, 40),
    done('Выставить счёт «Альфе»', 'direct', 1, '11:00'),
    done('Прочитать статью про продуктивность', 'noise', 1, '15:00'),
    done('Обновить аватарки в соцсетях', 'noise', 1, '16:00'),
    done('Подготовить КП для «Омеги»', 'direct', 2, '12:00'),
    done('Сделать заметки после встречи', 'indirect', 2, '17:00'),
    done('Переписать описание услуг', 'indirect', 3, '13:00'),
    done('Закрыть сделку с «Вектором-М»', 'direct', 3, '16:30'),
    done('Разложить файлы по папкам', 'noise', 4, '12:00'),
    done('Сверстать новый лендинг', 'indirect', 4, '18:00'),
    done('Изучить новый CRM', 'indirect', 5, '11:00'),
    done('Отправить три КП', 'direct', 5, '15:00'),
    done('Обзвон старой базы', 'direct', 6, '12:00'),
  ];
  const cut = [
    t('Сделать красивую таблицу расходов', 'noise', 'later', { status: 'cut', cutAt: at(-1, '19:00') }),
    t('Съездить на нетворкинг «на всякий случай»', 'noise', 'week', { status: 'cut', cutAt: at(-2, '19:00') }),
    t('Настроить рассылку по старой базе', 'indirect', 'week', { status: 'delegated', delegatedTo: 'Аня', cutAt: at(-1, '19:00') }),
  ];
  const sessions = [
    { taskId: tasks[11].id, impact: 'direct', minutes: 50, endedAt: ago(95) },
    { taskId: tasks[13].id, impact: 'direct', minutes: 25, endedAt: at(-1, '11:00') },
    { taskId: tasks[16].id, impact: 'direct', minutes: 90, endedAt: at(-2, '12:00') },
    { taskId: tasks[21].id, impact: 'indirect', minutes: 50, endedAt: at(-4, '18:00') },
  ];
  commit({
    ...state,
    onboarded: true,
    goal: { title: 'Продажи: 10 новых клиентов в месяц', metric: 'клиенты и выручка' },
    tasks: [...tasks, ...cut],
    sessions,
  });
}

