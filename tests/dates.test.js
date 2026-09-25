import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayKey,
  daysBetweenKeys,
  startOfWeek,
  atTime,
  formatWhen,
  formatDuration,
  plural,
  addDays,
} from '../js/dates.js';

test('dayKey использует локальную дату', () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('daysBetweenKeys считает календарные дни, в том числе через месяц', () => {
  assert.equal(daysBetweenKeys('2026-09-29', '2026-10-02'), 3);
  assert.equal(daysBetweenKeys('2026-10-02', '2026-09-29'), -3);
});

test('startOfWeek — понедельник', () => {
  assert.equal(dayKey(startOfWeek(new Date(2026, 8, 27))), '2026-09-21'); // воскресенье → пн
  assert.equal(dayKey(startOfWeek(new Date(2026, 8, 21, 8))), '2026-09-21');
});

test('atTime ставит время на тот же день', () => {
  const d = atTime(new Date(2026, 8, 25, 17), '09:30');
  assert.equal(d.getHours(), 9);
  assert.equal(d.getMinutes(), 30);
  assert.equal(dayKey(d), '2026-09-25');
});

test('formatWhen говорит по-человечески', () => {
  const now = new Date(2026, 8, 25, 12);
  assert.equal(formatWhen(new Date(2026, 8, 25, 14, 0), now), 'сегодня 14:00');
  assert.equal(formatWhen(addDays(now, 1), now), 'завтра 12:00');
  assert.equal(formatWhen(new Date(2026, 9, 12, 9, 5), now), '12 окт 09:05');
});

test('plural и formatDuration', () => {
  const forms = ['задача', 'задачи', 'задач'];
  assert.equal(plural(1, forms), 'задача');
  assert.equal(plural(3, forms), 'задачи');
  assert.equal(plural(11, forms), 'задач');
  assert.equal(plural(22, forms), 'задачи');
  assert.equal(formatDuration(85), '1 ч 25 мин');
  assert.equal(formatDuration(120), '2 ч');
  assert.equal(formatDuration(0), '0 мин');
});
