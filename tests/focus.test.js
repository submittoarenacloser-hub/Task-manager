import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startFocus, pauseFocus, resumeFocus, remainingMs, focusEndsAt, formatClock } from '../js/focus.js';
import { MINUTE } from '../js/dates.js';
import { FRI } from './helpers.js';

test('таймер учитывает паузу', () => {
  let f = startFocus('t', 25, FRI(10));
  assert.equal(remainingMs(f, FRI(10, 10)), 15 * MINUTE);
  f = pauseFocus(f, FRI(10, 10));
  assert.equal(focusEndsAt(f), null);
  assert.equal(remainingMs(f, FRI(11)), 15 * MINUTE);
  f = resumeFocus(f, FRI(11));
  assert.equal(remainingMs(f, FRI(11, 5)), 10 * MINUTE);
  assert.equal(focusEndsAt(f).getTime(), FRI(11, 15).getTime());
  assert.equal(remainingMs(f, FRI(12)), 0);
});

test('formatClock', () => {
  assert.equal(formatClock(25 * MINUTE), '25:00');
  assert.equal(formatClock(61_500), '01:02');
  assert.equal(formatClock(0), '00:00');
});
