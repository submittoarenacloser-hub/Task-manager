// Статистика и «радар ловушки»: не уходит ли время в косвенные задачи.

import { addDays, dayKey, daysBetweenKeys, startOfDay, plural, DAY } from './dates.js';
import { countByImpact, openIn, isOpen } from './model.js';

const within = (iso, from, to) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t < to.getTime();
};

export function doneBetween(tasks, from, to) {
  return tasks.filter((t) => t.status === 'done' && within(t.doneAt, from, to));
}

/** Доля прямых среди выполненных, 0..1, или null если ничего не сделано. */
export function focusShare(counts) {
  return counts.total ? counts.direct / counts.total : null;
}

export function doneToday(tasks, now = new Date()) {
  const from = startOfDay(now);
  return doneBetween(tasks, from, addDays(from, 1));
}

/** Сделанное по дням за последние `days` дней, включая сегодня. */
export function dailySeries(tasks, now = new Date(), days = 7) {
  const today = startOfDay(now);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const from = addDays(today, -i);
    const counts = countByImpact(doneBetween(tasks, from, addDays(from, 1)));
    out.push({ date: from, key: dayKey(from), ...counts });
  }
  return out;
}

/** Итоги за последние 7 дней и за 7 дней до них. */
export function weekSummary(tasks, now = new Date()) {
  const end = addDays(startOfDay(now), 1);
  const start = addDays(end, -7);
  const prevStart = addDays(start, -7);
  const cur = countByImpact(doneBetween(tasks, start, end));
  const prev = countByImpact(doneBetween(tasks, prevStart, start));
  const cut = tasks.filter(
    (t) => (t.status === 'cut' || t.status === 'delegated') && within(t.cutAt, start, end),
  ).length;
  return { cur, prev, share: focusShare(cur), prevShare: focusShare(prev), cut };
}

/** Минуты фокус-сессий по типам задач за период. */
export function focusMinutes(sessions = [], from, to) {
  const out = { direct: 0, indirect: 0, noise: 0, total: 0 };
  for (const s of sessions) {
    if (!within(s.endedAt, from, to)) continue;
    out[s.impact] = (out[s.impact] ?? 0) + s.minutes;
    out.total += s.minutes;
  }
  return out;
}

/** Сколько дней подряд (до сегодня включительно) сделана хотя бы одна прямая задача. */
export function directStreak(tasks, now = new Date()) {
  const days = new Set(
    tasks.filter((t) => t.status === 'done' && t.impact === 'direct' && t.doneAt).map((t) => dayKey(t.doneAt)),
  );
  let day = startOfDay(now);
  // Сегодня ещё не вечер: если сегодня пока пусто, серия считается со вчера.
  if (!days.has(dayKey(day))) day = addDays(day, -1);
  let n = 0;
  while (days.has(dayKey(day))) {
    n += 1;
    day = addDays(day, -1);
  }
  return n;
}

/** Сколько косвенных/шумовых задач закрыто подряд сегодня, начиная с последней. */
export function nonDirectStreak(tasks, now = new Date()) {
  const list = doneToday(tasks, now).sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt)));
  let n = 0;
  for (const t of list) {
    if (t.impact === 'direct') break;
    n += 1;
  }
  return n;
}

/** Прямые задачи, которые висят в «Сегодня» 2+ дня: их, скорее всего, избегают. */
export function stuckDirect(tasks, now = new Date(), minDays = 2) {
  const today = dayKey(now);
  return openIn(tasks, 'today')
    .filter((t) => t.impact === 'direct' && t.todaySince && daysBetweenKeys(t.todaySince, today) >= minDays)
    .map((t) => ({ task: t, days: daysBetweenKeys(t.todaySince, today) }));
}

/** Задачи в «Сегодня», оставшиеся с прошлых дней и ещё не разобранные. */
export function carryOver(tasks, now = new Date()) {
  const today = dayKey(now);
  return openIn(tasks, 'today').filter((t) => t.todaySince && t.todaySince < today && t.carryAck !== today);
}

/**
 * Радар ловушки занятости.
 * level: ok | warn | trap. reasons — почему, в порядке важности.
 */
export function trapStatus(tasks, now = new Date()) {
  const reasons = [];
  const todayOpen = openIn(tasks, 'today');
  const openDirect = todayOpen.filter((t) => t.impact === 'direct');
  const streak = nonDirectStreak(tasks, now);
  const week = weekSummary(tasks, now);
  const stuck = stuckDirect(tasks, now);
  let level = 'ok';
  const raise = (l) => {
    if (l === 'trap' || (l === 'warn' && level === 'ok')) level = l;
  };

  if (streak >= 3 && openDirect.length) {
    raise('trap');
    reasons.push({
      code: 'streak',
      message: `${streak} ${plural(streak, ['косвенная задача', 'косвенные задачи', 'косвенных задач'])} подряд, а прямая «${openDirect[0].title}» ждёт.`,
    });
  } else if (streak === 2 && openDirect.length) {
    raise('warn');
    reasons.push({ code: 'streak', message: `Две косвенные подряд. Следующей возьми «${openDirect[0].title}».` });
  }

  if (week.cur.total >= 6 && week.share !== null) {
    const pct = Math.round(week.share * 100);
    if (week.share < 0.35) {
      raise('trap');
      reasons.push({ code: 'week', message: `За 7 дней только ${pct}% сделанного — прямые задачи. Остальное — занятость.` });
    } else if (week.share < 0.5) {
      raise('warn');
      reasons.push({ code: 'week', message: `За 7 дней прямых задач ${pct}%. Меньше половины.` });
    }
  }

  if (stuck.length) {
    raise('warn');
    const { task, days } = stuck[0];
    reasons.push({
      code: 'stuck',
      message: `«${task.title}» висит в «Сегодня» уже ${days} дн. Разбей её на маленький первый шаг.`,
    });
  }

  if (todayOpen.length && !openDirect.length && !doneToday(tasks, now).some((t) => t.impact === 'direct')) {
    raise('warn');
    reasons.push({ code: 'no-direct', message: 'В плане на сегодня нет ни одной прямой задачи.' });
  }

  return { level, reasons, streak, week, openDirect };
}

/** Срез всех открытых задач для разбора 80/20. */
export function paretoSnapshot(tasks) {
  const open = tasks.filter(isOpen);
  const counts = countByImpact(open);
  return {
    ...counts,
    // Сколько задач «должно остаться» по правилу 20%.
    vital: Math.max(1, Math.round(counts.total * 0.2)),
    directShare: counts.total ? counts.direct / counts.total : 0,
  };
}

/** Возраст задачи в днях. */
export function ageDays(task, now = new Date()) {
  return Math.max(0, Math.floor((startOfDay(now) - startOfDay(task.createdAt)) / DAY));
}
