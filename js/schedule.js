// Что и когда показать в уведомлениях. Чистые функции — легко тестировать.

import { atTime, addDays, dayKey, formatWhen, plural, HOUR, WEEKDAYS_FULL } from './dates.js';
import { openIn, mainTaskOfDay, countByImpact, isOpen } from './model.js';
import { doneToday, focusShare, trapStatus } from './stats.js';
import { focusEndsAt } from './focus.js';

export const DEFAULT_NOTIFY = {
  enabled: false,
  morning: { on: true, time: '09:00' },
  midday: { on: true, time: '13:30' },
  evening: { on: true, time: '20:30' },
  weekly: { on: true, day: 0, time: '18:00' }, // 0 — воскресенье
  trap: true,
  reminders: true,
};

// Насколько поздно ещё можно показать пропущенное уведомление.
const GRACE = {
  daily: 2 * HOUR,
  reminder: 12 * HOUR,
  focus: HOUR,
};

const tasksWord = (n) => plural(n, ['задача', 'задачи', 'задач']);

function goalName(state) {
  return state.goal?.title ? `«${state.goal.title}»` : 'твоей цели';
}

export function morningMessage(state, now) {
  const main = mainTaskOfDay(state.tasks);
  const direct = openIn(state.tasks, 'today').filter((t) => t.impact === 'direct').length;
  if (!main) {
    return {
      title: 'Доброе утро. Что сегодня главное?',
      body: `Выбери одну задачу, которая напрямую двигает ${goalName(state)}. С неё и начни.`,
      url: '#tasks',
    };
  }
  return {
    title: `Начни с главного: ${main.title}`,
    body:
      direct > 1
        ? `Прямых задач на сегодня: ${direct}. Первый рабочий час — на прямую задачу, почта и мелочи потом.`
        : 'Первый рабочий час — на неё. Почта и мелочи потом.',
    url: '#focus',
  };
}

export function middayMessage(state, now) {
  const done = countByImpact(doneToday(state.tasks, now));
  const openDirect = openIn(state.tasks, 'today').filter((t) => t.impact === 'direct');
  if (!openDirect.length && done.direct) {
    return {
      title: 'Прямые задачи на сегодня закрыты',
      body: 'Можно взять следующую прямую из «Недели» или спокойно доделать мелочи.',
      url: '#tasks',
    };
  }
  if (!openDirect.length) {
    return {
      title: 'Проверка курса',
      body: `Половина дня прошла, а прямых задач в плане нет. Что сегодня реально двигает ${goalName(state)}?`,
      url: '#tasks',
    };
  }
  return {
    title: 'Проверка курса: ты сейчас на прямой задаче?',
    body: `Сделано прямых: ${done.direct}, косвенных: ${done.indirect + done.noise}. Дальше — «${openDirect[0].title}».`,
    url: '#focus',
  };
}

export function eveningMessage(state, now) {
  const done = countByImpact(doneToday(state.tasks, now));
  const share = focusShare(done);
  const left = openIn(state.tasks, 'today').length;
  const head = done.total
    ? `Итог дня: фокус ${Math.round(share * 100)}%`
    : 'Итог дня: пока ничего не отмечено';
  const parts = [];
  if (done.total) parts.push(`Прямых ${done.direct}, косвенных ${done.indirect}, шума ${done.noise}.`);
  if (left) parts.push(`В «Сегодня» осталось ${left} ${tasksWord(left)} — перенеси или отсеки.`);
  parts.push('Выбери главную задачу на завтра.');
  return { title: head, body: parts.join(' '), url: '#tasks' };
}

export function weeklyMessage(state) {
  const open = state.tasks.filter(isOpen).length;
  return {
    title: 'Разбор недели 80/20',
    body: `Открыто ${open} ${tasksWord(open)}. Оставь 20%, которые двигают ${goalName(state)}, остальное отсеки.`,
    url: '#triage',
  };
}

const DAILY = {
  morning: morningMessage,
  midday: middayMessage,
  evening: eveningMessage,
};

/**
 * Уведомления, которые пора показать прямо сейчас.
 * fired — словарь уже показанных ключей, чтобы не повторяться.
 */
export function dueNotifications(state, now = new Date(), fired = {}) {
  const cfg = { ...DEFAULT_NOTIFY, ...state.settings?.notify };
  if (!cfg.enabled) return [];
  const out = [];
  const t = new Date(now).getTime();
  const today = dayKey(now);
  const add = (key, at, grace, build) => {
    const ts = new Date(at).getTime();
    if (fired[key] || t < ts || t - ts >= grace) return;
    const msg = build();
    if (msg) out.push({ key, ...msg });
  };

  for (const kind of Object.keys(DAILY)) {
    if (!cfg[kind]?.on) continue;
    add(`${kind}:${today}`, atTime(now, cfg[kind].time), GRACE.daily, () => ({ kind, ...DAILY[kind](state, now) }));
  }

  if (cfg.weekly?.on && new Date(now).getDay() === Number(cfg.weekly.day)) {
    add(`weekly:${today}`, atTime(now, cfg.weekly.time), GRACE.daily, () => ({ kind: 'weekly', ...weeklyMessage(state) }));
  }

  if (cfg.reminders) {
    for (const task of state.tasks) {
      if (!isOpen(task) || !task.remindAt) continue;
      add(`task:${task.id}:${task.remindAt}`, task.remindAt, GRACE.reminder, () => ({
        kind: 'reminder',
        title: task.title,
        body: task.impact === 'direct' ? 'Напоминание · прямая задача' : 'Напоминание',
        url: '#tasks',
      }));
    }
  }

  const end = focusEndsAt(state.focus);
  if (end) {
    const task = state.tasks.find((x) => x.id === state.focus.taskId);
    add(`focus:${state.focus.startedAt}`, end, GRACE.focus, () => ({
      kind: 'focus',
      title: 'Фокус-сессия окончена',
      body: task ? `«${task.title}». Отметь результат или продолжи ещё один круг.` : 'Отметь результат.',
      url: '#focus',
    }));
  }

  if (cfg.trap) {
    const trap = trapStatus(state.tasks, now);
    if (trap.streak >= 3 && trap.openDirect.length) {
      // Не чаще, чем на каждой третьей косвенной подряд: 3, 6, 9…
      const key = `trap:${today}:${Math.floor(trap.streak / 3)}`;
      if (!fired[key]) {
        out.push({
          key,
          kind: 'trap',
          title: 'Похоже на ловушку занятости',
          body: trap.reasons[0]?.message ?? 'Вернись к прямой задаче.',
          url: '#focus',
        });
      }
    }
  }

  return out;
}

/** Ближайшие запланированные уведомления — для экрана настроек. */
export function upcoming(state, now = new Date(), limit = 4) {
  const cfg = { ...DEFAULT_NOTIFY, ...state.settings?.notify };
  if (!cfg.enabled) return [];
  const names = { morning: 'План на день', midday: 'Проверка курса', evening: 'Итог дня' };
  const list = [];
  for (let d = 0; d < 8; d++) {
    const day = addDays(now, d);
    for (const kind of Object.keys(names)) {
      if (cfg[kind]?.on) list.push({ at: atTime(day, cfg[kind].time), title: names[kind] });
    }
    if (cfg.weekly?.on && day.getDay() === Number(cfg.weekly.day)) {
      list.push({ at: atTime(day, cfg.weekly.time), title: `Разбор недели (${WEEKDAYS_FULL[cfg.weekly.day]})` });
    }
  }
  if (cfg.reminders) {
    for (const task of state.tasks) {
      if (isOpen(task) && task.remindAt) list.push({ at: new Date(task.remindAt), title: task.title });
    }
  }
  const end = focusEndsAt(state.focus);
  if (end) list.push({ at: end, title: 'Конец фокус-сессии' });
  return list
    .filter((x) => x.at > now)
    .sort((a, b) => a.at - b.at)
    .slice(0, limit)
    .map((x) => ({ ...x, when: formatWhen(x.at, now) }));
}
