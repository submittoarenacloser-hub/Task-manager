// Что и когда показать в уведомлениях. Чистые функции — легко тестировать.

import { atTime, addDays, dayKey, formatWhen, formatDuration, plural, HOUR, WEEKDAYS_FULL } from './dates.js';
import { openIn, mainTaskOfDay, countByImpact, isOpen } from './model.js';
import { doneToday, focusShare, trapStatus } from './stats.js';
import { boundaries } from './focus.js';
import { occurrencesBetween } from './repeat.js';

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

const DAILY_NAMES = { morning: 'План на день', midday: 'Проверка курса', evening: 'Итог дня' };

const settingsOf = (state) => ({ ...DEFAULT_NOTIFY, ...state.settings?.notify });

/**
 * Все уведомления по времени на дни [from, from + days).
 * Текст собирается лениво (build) на момент показа: состояние меняется только
 * внутри приложения, поэтому текст, собранный заранее, остаётся верным.
 */
function timedNotifications(state, from, days) {
  const cfg = settingsOf(state);
  const list = [];
  for (let d = 0; d < days; d++) {
    const day = addDays(from, d);
    const key = dayKey(day);
    for (const kind of Object.keys(DAILY)) {
      if (!cfg[kind]?.on) continue;
      const at = atTime(day, cfg[kind].time);
      list.push({ key: `${kind}:${key}`, kind, at, name: DAILY_NAMES[kind], build: () => DAILY[kind](state, at) });
    }
    if (cfg.weekly?.on && day.getDay() === Number(cfg.weekly.day)) {
      list.push({
        key: `weekly:${key}`,
        kind: 'weekly',
        at: atTime(day, cfg.weekly.time),
        name: `Разбор недели (${WEEKDAYS_FULL[cfg.weekly.day]})`,
        build: () => weeklyMessage(state),
      });
    }
  }
  if (cfg.reminders) {
    const reminder = (task, key, at) =>
      list.push({
        key,
        kind: 'reminder',
        at,
        name: task.title,
        build: () => ({
          title: task.title,
          body: task.impact === 'direct' ? 'Напоминание · прямая задача' : 'Напоминание',
          url: '#tasks',
        }),
      });
    const first = dayKey(from);
    const last = dayKey(addDays(from, days - 1));
    for (const task of state.tasks) {
      if (!isOpen(task)) continue;
      if (task.repeat && task.remindTime && task.dueDate) {
        // повторяющаяся: напоминание в каждый её день, начиная с ближайшего
        const start = task.dueDate > first ? task.dueDate : first;
        for (const date of occurrencesBetween(task.repeat, start, last)) {
          reminder(task, `task:${task.id}:${date}`, atTime(new Date(`${date}T00:00`), task.remindTime));
        }
      } else if (task.remindAt) {
        reminder(task, `task:${task.id}:${task.remindAt}`, new Date(task.remindAt));
      }
    }
  }
  const f = state.focus;
  if (f) {
    const task = state.tasks.find((x) => x.id === f.taskId);
    const name = task ? `«${task.title}»` : 'задача';
    const rounds = f.plan.filter((x) => x.kind === 'focus');
    for (const { index, at } of boundaries(f)) {
      const seg = f.plan[index];
      const next = f.plan[index + 1];
      let msg;
      if (!next) {
        const mins = rounds.reduce((a, x) => a + x.minutes, 0);
        msg = {
          title: 'Фокус-сессия окончена',
          body: `${name}: ${formatDuration(mins)} фокуса. Отметь результат.`,
        };
      } else if (seg.kind === 'focus') {
        const round = f.plan.slice(0, index + 1).filter((x) => x.kind === 'focus').length;
        msg = {
          title: `Перерыв ${next.minutes} мин`,
          body: `Круг ${round} из ${rounds.length} готов. Встань, пройдись, отвлекись от экрана.`,
        };
      } else {
        msg = {
          title: 'Перерыв окончен, снова фокус',
          body: `${name}, ${next.minutes} мин.`,
        };
      }
      list.push({
        key: `focus:${f.startedAt}:${index}`,
        kind: 'focus',
        at,
        name: next ? (seg.kind === 'focus' ? 'Перерыв' : 'Снова фокус') : 'Конец фокус-сессии',
        build: () => ({ ...msg, url: '#focus' }),
      });
    }
  }
  return list;
}

const GRACE_BY_KIND = {
  morning: GRACE.daily,
  midday: GRACE.daily,
  evening: GRACE.daily,
  weekly: GRACE.daily,
  reminder: GRACE.reminder,
  focus: GRACE.focus,
};

const materialize = ({ build, name, ...item }) => ({ ...item, ...build() });

/**
 * Уведомления, которые пора показать прямо сейчас.
 * fired — словарь уже показанных ключей, чтобы не повторяться.
 * only — показать только эти виды (в Android-версии остальные запланированы системой).
 */
export function dueNotifications(state, now = new Date(), fired = {}, { only = null } = {}) {
  if (!settingsOf(state).enabled) return [];
  const t = new Date(now).getTime();
  const wanted = (kind) => !only || only.includes(kind);

  const out = timedNotifications(state, now, 1)
    .filter((n) => wanted(n.kind) && !fired[n.key])
    .filter((n) => t >= n.at.getTime() && t - n.at.getTime() < GRACE_BY_KIND[n.kind])
    .map(materialize);

  if (settingsOf(state).trap && wanted('trap')) {
    const trap = trapStatus(state.tasks, now);
    if (trap.streak >= 3 && trap.openDirect.length) {
      // Не чаще, чем на каждой третьей косвенной подряд: 3, 6, 9…
      const key = `trap:${dayKey(now)}:${Math.floor(trap.streak / 3)}`;
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

/** Всё, что нужно заранее поставить в расписание системы на ближайшие дни. */
export function plannedNotifications(state, now = new Date(), days = 7) {
  if (!settingsOf(state).enabled) return [];
  return timedNotifications(state, now, days)
    .filter((n) => n.at > now)
    .sort((a, b) => a.at - b.at)
    .map(materialize);
}

/** Ближайшие запланированные уведомления — для экрана настроек. */
export function upcoming(state, now = new Date(), limit = 4) {
  if (!settingsOf(state).enabled) return [];
  return timedNotifications(state, now, 8)
    .filter((n) => n.at > now)
    .sort((a, b) => a.at - b.at)
    .slice(0, limit)
    .map((n) => ({ at: n.at, title: n.name, when: formatWhen(n.at, now) }));
}
