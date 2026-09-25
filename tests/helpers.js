import { createTask } from '../js/model.js';

let n = 0;

/** Задача для тестов: createTask + любые поля поверх. */
export function mk(fields = {}, now = new Date(2026, 8, 25, 12, 0)) {
  n += 1;
  return {
    ...createTask({ title: `Задача ${n}`, impact: 'direct', horizon: 'today', ...fields }, now),
    id: fields.id ?? `t${n}`,
    ...fields,
  };
}

/** Выполненная задача в указанный момент. */
export const done = (impact, when, extra = {}) =>
  mk({ impact, status: 'done', doneAt: new Date(when).toISOString(), ...extra });

// Пятница, 25 сентября 2026
export const FRI = (h = 12, m = 0) => new Date(2026, 8, 25, h, m);
