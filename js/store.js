// Состояние приложения: хранение в localStorage, действия, подписка на изменения.

import { createTask, withHorizon, uid } from './model.js';
import { DEFAULT_LIMITS } from './rules.js';
import { DEFAULT_NOTIFY } from './schedule.js';
import { startFocus, pauseFocus, resumeFocus, elapsedMs } from './focus.js';
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
      focusMinutes: 25,
    },
  };
}

/** Дополняет сохранённые данные значениями по умолчанию (для старых версий и импорта). */
export function normalize(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const settings = raw.settings ?? {};
  const notify = settings.notify ?? {};
  return {
    ...base,
    ...raw,
    schema: SCHEMA,
    goal: { ...base.goal, ...raw.goal },
    tasks: Array.isArray(raw.tasks) ? raw.tasks.filter((t) => t && t.id && t.title) : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    settings: {
      ...base.settings,
      ...settings,
      limits: { ...base.settings.limits, ...settings.limits },
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
    return raw ? normalize(JSON.parse(raw)) : defaultState();
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
  if (!silent) for (const fn of listeners) fn(state);
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

export function toggleDone(id) {
  patchTask(id, (t) =>
    t.status === 'done' ? { ...t, status: 'open', doneAt: null } : { ...t, status: 'done', doneAt: nowIso() },
  );
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

export function beginFocus(taskId, minutes = state.settings.focusMinutes) {
  commit({ ...state, focus: startFocus(taskId, minutes) });
}

export function pauseCurrentFocus() {
  commit({ ...state, focus: pauseFocus(state.focus) });
}

export function resumeCurrentFocus() {
  commit({ ...state, focus: resumeFocus(state.focus) });
}

/** Завершить сессию и записать потраченные минуты (если набралась хотя бы минута). */
export function endFocus({ markDone = false } = {}) {
  const f = state.focus;
  if (!f) return;
  const task = findTask(f.taskId);
  const minutes = Math.min(f.minutes, Math.round(elapsedMs(f) / MINUTE));
  const sessions = minutes >= 1 && task
    ? [...state.sessions, { taskId: f.taskId, impact: task.impact, minutes, endedAt: nowIso() }]
    : state.sessions;
  const tasks = markDone
    ? state.tasks.map((t) => (t.id === f.taskId ? { ...t, status: 'done', doneAt: nowIso() } : t))
    : state.tasks;
  commit({ ...state, focus: null, sessions: sessions.slice(-500), tasks });
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

