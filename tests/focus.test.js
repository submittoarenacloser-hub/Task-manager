import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlan,
  summarizePlan,
  startFocus,
  pauseFocus,
  resumeFocus,
  skipSegment,
  position,
  remainingMs,
  boundaries,
  focusEndsAt,
  focusMinutesDone,
  normalizeFocus,
  formatClock,
} from '../js/focus.js';
import { MINUTE } from '../js/dates.js';
import { FRI } from './helpers.js';

const kinds = (plan) => plan.map((s) => `${s.kind === 'focus' ? 'Ф' : 'п'}${s.minutes}`).join(' ');

test('план: 3 часа при 50/10 — это 50 · 10 · 50 · 10 · 50', () => {
  assert.equal(kinds(buildPlan({ focus: 50, brk: 10, total: 180 })), 'Ф50 п10 Ф50 п10 Ф50');
  assert.deepEqual(summarizePlan(buildPlan({ focus: 50, brk: 10, total: 180 })), {
    rounds: 3,
    breaks: 2,
    focusMinutes: 150,
    totalMinutes: 170,
  });
});

test('план: хвост короче 10 минут не превращается в круг', () => {
  assert.equal(kinds(buildPlan({ focus: 25, brk: 5, total: 90 })), 'Ф25 п5 Ф25 п5 Ф25');
  assert.equal(kinds(buildPlan({ focus: 45, brk: 15, total: 120 })), 'Ф45 п15 Ф45');
  // остаток больше 10 минут — короткий последний круг
  assert.equal(kinds(buildPlan({ focus: 50, brk: 10, total: 90 })), 'Ф50 п10 Ф30');
});

test('план: один круг и общее время короче круга', () => {
  assert.equal(kinds(buildPlan({ focus: 50, brk: 10, total: 0 })), 'Ф50');
  assert.equal(kinds(buildPlan({ focus: 90, brk: 10, total: 60 })), 'Ф60');
});

test('этапы сменяются сами, пауза останавливает время', () => {
  const plan = buildPlan({ focus: 50, brk: 10, total: 180 });
  let f = startFocus('t', plan, FRI(10));
  let p = position(f, FRI(10, 20));
  assert.deepEqual([p.index, p.segment.kind, p.round, p.rounds], [0, 'focus', 1, 3]);
  assert.equal(p.segmentRemainingMs, 30 * MINUTE);
  p = position(f, FRI(10, 55));
  assert.deepEqual([p.segment.kind, p.segmentRemainingMs], ['break', 5 * MINUTE]);
  p = position(f, FRI(11, 5));
  assert.deepEqual([p.segment.kind, p.round], ['focus', 2]);
  f = pauseFocus(f, FRI(11, 5));
  assert.equal(remainingMs(f, FRI(15)), 45 * MINUTE);
  f = resumeFocus(f, FRI(15));
  assert.equal(focusEndsAt(f).getTime(), FRI(16, 45).getTime());
  assert.equal(position(f, FRI(17)).finished, true);
});

test('пропустить перерыв — сразу следующий круг', () => {
  const plan = buildPlan({ focus: 50, brk: 10, total: 180 });
  const f = skipSegment(startFocus('t', plan, FRI(10)), FRI(10, 52));
  const p = position(f, FRI(10, 52));
  assert.deepEqual([p.segment.kind, p.round], ['focus', 2]);
  assert.equal(p.segmentRemainingMs, 50 * MINUTE);
});

test('уведомления: по одному на каждый переход, на паузе — ни одного', () => {
  const f = startFocus('t', buildPlan({ focus: 50, brk: 10, total: 180 }), FRI(10));
  assert.deepEqual(
    boundaries(f).map((b) => b.at.toTimeString().slice(0, 5)),
    ['10:50', '11:00', '11:50', '12:00', '12:50'],
  );
  assert.deepEqual(boundaries(pauseFocus(f, FRI(10, 30))), []);
  // пропущенный этап в расписание не попадает
  const skipped = skipSegment(f, FRI(10, 52));
  assert.equal(boundaries(skipped)[0].index, 2);
});

test('пропущенный кусок круга фокусом не считается', () => {
  const f = startFocus('t', buildPlan({ focus: 50, brk: 10, total: 180 }), FRI(10));
  const skipped = skipSegment(f, FRI(10, 20)); // 20 мин фокуса, остальные 30 пропущены
  assert.equal(focusMinutesDone(skipped, FRI(10, 20)), 20);
  // перерыв пропустили — фокус не меняется, второй круг идёт честно
  const next = skipSegment(skipped, FRI(10, 21));
  assert.equal(focusMinutesDone(next, FRI(10, 31)), 30);
});

test('минуты фокуса без перерывов', () => {
  const f = startFocus('t', buildPlan({ focus: 50, brk: 10, total: 180 }), FRI(10));
  assert.equal(focusMinutesDone(f, FRI(10, 30)), 30);
  assert.equal(focusMinutesDone(f, FRI(11, 10)), 60);
  assert.equal(focusMinutesDone(f, FRI(14)), 150);
});

test('таймер прошлой версии превращается в план из одного круга', () => {
  const old = { taskId: 't', minutes: 25, startedAt: 'x', runStartedAt: null, elapsedMs: 0, running: false };
  assert.deepEqual(normalizeFocus(old).plan, [{ kind: 'focus', minutes: 25 }]);
  assert.equal(normalizeFocus(null), null);
});

test('formatClock', () => {
  assert.equal(formatClock(25 * MINUTE), '25:00');
  assert.equal(formatClock(61_500), '01:02');
  assert.equal(formatClock(0), '00:00');
});
