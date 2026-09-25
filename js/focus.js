// Таймер Помодоро: круги фокуса с перерывами в пределах общего времени.
// Чистые функции, состояние хранится в store:
// { taskId, plan: [{ kind: 'focus' | 'break', minutes }], startedAt, runStartedAt, elapsedMs, running }.
// Время идёт одной линией по всему плану, пауза её останавливает; этап — отрезок на этой линии.

import { MINUTE } from './dates.js';

export const FOCUS_OPTIONS = [25, 45, 50, 60, 90];
export const BREAK_OPTIONS = [5, 10, 15, 20];
/** 0 — один круг без перерывов. */
export const TOTAL_OPTIONS = [0, 60, 90, 120, 180, 240];
export const DEFAULT_POMODORO = { focus: 50, brk: 10, total: 120 };

// Короче этого круг фокуса не добавляем: хвост в 5 минут не даёт ничего сделать.
const MIN_BLOCK = 10;

/**
 * План сессии: фокус, перерыв, фокус… пока хватает общего времени.
 * 180 мин при 50/10 → 50 · 10 · 50 · 10 · 50.
 */
export function buildPlan({ focus, brk, total }) {
  if (!total) return [{ kind: 'focus', minutes: focus }];
  if (total <= focus) return [{ kind: 'focus', minutes: total }];
  const plan = [];
  let left = total;
  while (left > 0) {
    const minutes = Math.min(focus, left);
    if (minutes < MIN_BLOCK && plan.length) break;
    plan.push({ kind: 'focus', minutes });
    left -= minutes;
    if (!brk || left - brk < MIN_BLOCK) break;
    plan.push({ kind: 'break', minutes: brk });
    left -= brk;
  }
  return plan;
}

export function summarizePlan(plan) {
  const focus = plan.filter((s) => s.kind === 'focus');
  const breaks = plan.filter((s) => s.kind === 'break');
  return {
    rounds: focus.length,
    breaks: breaks.length,
    focusMinutes: focus.reduce((a, s) => a + s.minutes, 0),
    totalMinutes: plan.reduce((a, s) => a + s.minutes, 0),
  };
}

/** Совместимость с таймером прошлой версии: { minutes } → план из одного круга. */
export function normalizeFocus(f) {
  if (!f) return null;
  if (Array.isArray(f.plan) && f.plan.length) return f;
  if (f.minutes) {
    const { minutes, ...rest } = f;
    return { ...rest, plan: [{ kind: 'focus', minutes }] };
  }
  return null;
}

export function startFocus(taskId, plan, now = new Date()) {
  const iso = new Date(now).toISOString();
  return { taskId, plan, startedAt: iso, runStartedAt: iso, elapsedMs: 0, running: true };
}

const planMs = (plan) => plan.reduce((a, s) => a + s.minutes * MINUTE, 0);

/** Концы этапов на общей линии времени, мс от начала. */
const segmentEnds = (plan) => {
  let acc = 0;
  return plan.map((s) => (acc += s.minutes * MINUTE));
};

export function elapsedMs(f, now = new Date()) {
  if (!f) return 0;
  const running = f.running && f.runStartedAt ? new Date(now) - new Date(f.runStartedAt) : 0;
  return Math.min(planMs(f.plan), f.elapsedMs + Math.max(0, running));
}

/** Где мы сейчас: номер этапа, сколько от него осталось, какой по счёту круг фокуса. */
export function position(f, now = new Date()) {
  const ends = segmentEnds(f.plan);
  const elapsed = elapsedMs(f, now);
  const finished = elapsed >= ends.at(-1);
  const index = finished ? f.plan.length - 1 : ends.findIndex((end) => elapsed < end);
  const segment = f.plan[index];
  const rounds = f.plan.filter((s) => s.kind === 'focus').length;
  const round = f.plan.slice(0, index + 1).filter((s) => s.kind === 'focus').length;
  return {
    index,
    segment,
    finished,
    round,
    rounds,
    segmentRemainingMs: finished ? 0 : ends[index] - elapsed,
    segmentProgress: finished ? 1 : 1 - (ends[index] - elapsed) / (segment.minutes * MINUTE),
    totalRemainingMs: ends.at(-1) - elapsed,
  };
}

/** Сколько осталось в текущем этапе. */
export function remainingMs(f, now = new Date()) {
  return f ? position(f, now).segmentRemainingMs : 0;
}

export function isFinished(f, now = new Date()) {
  return !!f && position(f, now).finished;
}

export function pauseFocus(f, now = new Date()) {
  if (!f?.running) return f;
  return { ...f, running: false, elapsedMs: elapsedMs(f, now), runStartedAt: null };
}

export function resumeFocus(f, now = new Date()) {
  if (!f || f.running) return f;
  return { ...f, running: true, runStartedAt: new Date(now).toISOString() };
}

/**
 * Перейти к следующему этапу сразу: пропустить перерыв или закончить круг раньше.
 * Пропущенное время запоминается, чтобы не засчитать его как фокус.
 */
export function skipSegment(f, now = new Date()) {
  if (!f) return f;
  const { index, finished, segment } = position(f, now);
  if (finished) return f;
  const end = segmentEnds(f.plan)[index];
  const skippedFocusMs = (f.skippedFocusMs ?? 0) + (segment.kind === 'focus' ? end - elapsedMs(f, now) : 0);
  return { ...f, elapsedMs: end, skippedFocusMs, runStartedAt: f.running ? new Date(now).toISOString() : null };
}

/**
 * Будущие переходы между этапами (для уведомлений). Только у идущей сессии:
 * на паузе расписания нет, после продолжения оно пересчитывается.
 */
export function boundaries(f) {
  if (!f?.running) return [];
  const start = new Date(f.runStartedAt).getTime() - f.elapsedMs;
  return segmentEnds(f.plan)
    .map((end, index) => ({ index, end }))
    .filter(({ end }) => end > f.elapsedMs)
    .map(({ index, end }) => ({ index, at: new Date(start + end) }));
}

/** Когда закончится вся сессия (null — на паузе). */
export function focusEndsAt(f) {
  return boundaries(f).at(-1)?.at ?? null;
}

/** Сколько минут фокуса (без перерывов) уже прошло. */
export function focusMinutesDone(f, now = new Date()) {
  if (!f) return 0;
  const elapsed = elapsedMs(f, now);
  let from = 0;
  let ms = 0;
  for (const s of f.plan) {
    const to = from + s.minutes * MINUTE;
    if (s.kind === 'focus') ms += Math.max(0, Math.min(elapsed, to) - from);
    from = to;
  }
  return Math.round(Math.max(0, ms - (f.skippedFocusMs ?? 0)) / MINUTE);
}

/** «24:59» */
export function formatClock(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
