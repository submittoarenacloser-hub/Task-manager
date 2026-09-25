import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextOccurrence, occurrencesBetween, describeRule, presetOf, horizonForDate, normalizeRule } from '../js/repeat.js';

// 25 сентября 2026 — пятница
const rule = (r, anchor = '2026-09-25') => ({ ...r, anchor });

test('каждый день и через день считаются от первого раза', () => {
  assert.equal(nextOccurrence(rule({ unit: 'day', every: 1 }), '2026-09-25'), '2026-09-26');
  const every2 = rule({ unit: 'day', every: 2 });
  assert.equal(nextOccurrence(every2, '2026-09-25'), '2026-09-27');
  assert.equal(nextOccurrence(every2, '2026-09-26'), '2026-09-27');
  assert.equal(nextOccurrence(every2, '2026-09-27'), '2026-09-29');
});

test('до первого раза следующий — сам первый раз', () => {
  assert.equal(nextOccurrence(rule({ unit: 'month', every: 3 }, '2026-10-25'), '2026-09-25'), '2026-10-25');
  assert.equal(nextOccurrence(rule({ unit: 'day', every: 1 }, '2026-10-01'), '2026-09-25'), '2026-10-01');
});

test('по будням пропускает выходные', () => {
  const weekdays = rule({ unit: 'week', every: 1, weekdays: [1, 2, 3, 4, 5] });
  assert.equal(nextOccurrence(weekdays, '2026-09-25'), '2026-09-28'); // пт → пн
  assert.deepEqual(occurrencesBetween(weekdays, '2026-09-25', '2026-10-02'), [
    '2026-09-25', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02',
  ]);
});

test('раз в две недели по пн и ср', () => {
  const r = rule({ unit: 'week', every: 2, weekdays: [1, 3] }, '2026-09-21'); // пн
  assert.deepEqual(occurrencesBetween(r, '2026-09-21', '2026-10-11'), ['2026-09-21', '2026-09-23', '2026-10-05', '2026-10-07']);
});

test('каждый месяц 31-го: в коротком месяце — последний день, потом снова 31-е', () => {
  const r = rule({ unit: 'month', every: 1 }, '2026-01-31');
  assert.deepEqual(occurrencesBetween(r, '2026-01-01', '2026-04-30'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
});

test('раз в 3 и 6 месяцев, раз в год (29 февраля)', () => {
  assert.equal(nextOccurrence(rule({ unit: 'month', every: 3 }, '2026-04-25'), '2026-04-25'), '2026-07-25');
  assert.equal(nextOccurrence(rule({ unit: 'month', every: 6 }, '2026-04-25'), '2026-09-01'), '2026-10-25');
  const leap = rule({ unit: 'year', every: 1 }, '2028-02-29');
  assert.deepEqual(occurrencesBetween(leap, '2028-01-01', '2032-12-31'), ['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
});

test('описание правила по-русски', () => {
  assert.equal(describeRule(rule({ unit: 'day', every: 1 })), 'каждый день');
  assert.equal(describeRule(rule({ unit: 'day', every: 2 })), 'через день');
  assert.equal(describeRule(rule({ unit: 'day', every: 5 })), 'каждые 5 дней');
  assert.equal(describeRule(rule({ unit: 'week', every: 1, weekdays: [1, 2, 3, 4, 5] })), 'по будням');
  assert.equal(describeRule(rule({ unit: 'week', every: 1, weekdays: [1, 3, 5] })), 'по пн, ср, пт');
  assert.equal(describeRule(rule({ unit: 'week', every: 1 })), 'по пятницам');
  assert.equal(describeRule(rule({ unit: 'month', every: 3 })), 'раз в 3 месяца, 25-го');
  assert.equal(describeRule(rule({ unit: 'month', every: 6 })), 'раз в полгода, 25-го');
  assert.equal(describeRule(rule({ unit: 'year', every: 1 })), 'каждый год 25 сентября');
});

test('вариант из списка узнаётся по правилу', () => {
  assert.equal(presetOf(null), 'none');
  assert.equal(presetOf(normalizeRule({ unit: 'week', every: 1, weekdays: [5, 4, 3, 2, 1] }, '2026-09-25')), 'weekdays');
  assert.equal(presetOf(normalizeRule({ unit: 'week', every: 1 }, '2026-09-25')), 'weekly');
  assert.equal(presetOf(normalizeRule({ unit: 'month', every: 3 }, '2026-09-25')), 'quarterly');
  assert.equal(presetOf(normalizeRule({ unit: 'day', every: 4 }, '2026-09-25')), 'custom');
});

test('горизонт по дате', () => {
  assert.equal(horizonForDate('2026-09-24', '2026-09-25'), 'today');
  assert.equal(horizonForDate('2026-09-25', '2026-09-25'), 'today');
  assert.equal(horizonForDate('2026-10-01', '2026-09-25'), 'week');
  assert.equal(horizonForDate('2026-10-20', '2026-09-25'), 'month');
  assert.equal(horizonForDate('2026-12-25', '2026-09-25'), 'later');
});
