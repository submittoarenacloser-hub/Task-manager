// Таймер фокус-сессии. Чистые функции: состояние хранится в store.

import { MINUTE } from './dates.js';

export const FOCUS_PRESETS = [25, 50, 90];

export function startFocus(taskId, minutes, now = new Date()) {
  const iso = new Date(now).toISOString();
  return { taskId, minutes, startedAt: iso, runStartedAt: iso, elapsedMs: 0, running: true };
}

export function elapsedMs(f, now = new Date()) {
  if (!f) return 0;
  const running = f.running && f.runStartedAt ? new Date(now) - new Date(f.runStartedAt) : 0;
  return f.elapsedMs + Math.max(0, running);
}

export function remainingMs(f, now = new Date()) {
  if (!f) return 0;
  return Math.max(0, f.minutes * MINUTE - elapsedMs(f, now));
}

export function pauseFocus(f, now = new Date()) {
  if (!f?.running) return f;
  return { ...f, running: false, elapsedMs: elapsedMs(f, now), runStartedAt: null };
}

export function resumeFocus(f, now = new Date()) {
  if (!f || f.running) return f;
  return { ...f, running: true, runStartedAt: new Date(now).toISOString() };
}

/** Когда закончится идущая сессия (null — на паузе). */
export function focusEndsAt(f) {
  if (!f?.running) return null;
  return new Date(new Date(f.runStartedAt).getTime() + f.minutes * MINUTE - f.elapsedMs);
}

export function isFinished(f, now = new Date()) {
  return !!f && remainingMs(f, now) === 0;
}

/** «24:59» */
export function formatClock(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
