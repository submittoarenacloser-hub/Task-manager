// Правила фокуса: что можно поставить в «Сегодня», а что нет.

import { openIn, countByImpact } from './model.js';
import { plural } from './dates.js';

export const DEFAULT_LIMITS = {
  today: 5, // всего задач на сегодня
  todayIndirect: 2, // из них косвенных
};

/**
 * Проверка перед добавлением/переносом задачи в горизонт.
 * blockers — нарушают правило (приложение просит подтверждения),
 * warnings — мягкие подсказки.
 */
export function checkPlacement(tasks, { impact, horizon, id = null }, limits = DEFAULT_LIMITS) {
  const result = { ok: true, blockers: [], warnings: [] };
  if (horizon !== 'today') return result;

  const today = openIn(tasks, 'today').filter((t) => t.id !== id);
  const counts = countByImpact(today);

  if (impact === 'noise') {
    result.blockers.push({
      code: 'noise-today',
      message: 'Шум не попадает в «Сегодня». Лучше отсечь задачу или делегировать.',
    });
  }
  if (counts.total >= limits.today) {
    result.blockers.push({
      code: 'today-full',
      message: `На сегодня уже ${counts.total} ${plural(counts.total, ['задача', 'задачи', 'задач'])} при лимите ${limits.today}. Сначала закончи или убери одну.`,
    });
  }
  if (impact === 'indirect' && counts.indirect >= limits.todayIndirect) {
    result.blockers.push({
      code: 'indirect-limit',
      message: `Косвенных на сегодня уже ${counts.indirect} из ${limits.todayIndirect}. Сначала прямые задачи.`,
    });
  }
  if (impact !== 'direct' && counts.direct === 0) {
    result.warnings.push({
      code: 'no-direct',
      message: 'На сегодня нет ни одной прямой задачи. Что сегодня реально принесёт результат?',
    });
  }

  result.ok = result.blockers.length === 0;
  return result;
}

/** Заполненность дня для индикатора «4 / 5». */
export function todayLoad(tasks, limits = DEFAULT_LIMITS) {
  const counts = countByImpact(openIn(tasks, 'today'));
  return { ...counts, limit: limits.today, indirectLimit: limits.todayIndirect };
}
