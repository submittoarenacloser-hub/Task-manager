import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPlacement, DEFAULT_LIMITS } from '../js/rules.js';
import { compareTasks, withHorizon } from '../js/model.js';
import { mk } from './helpers.js';

const codes = (r) => r.blockers.map((b) => b.code);

test('шум в «Сегодня» не ставится', () => {
  const r = checkPlacement([], { impact: 'noise', horizon: 'today' });
  assert.equal(r.ok, false);
  assert.deepEqual(codes(r), ['noise-today']);
});

test('шум в «Потом» — без ограничений', () => {
  assert.equal(checkPlacement([], { impact: 'noise', horizon: 'later' }).ok, true);
});

test('лимит задач на сегодня', () => {
  const tasks = Array.from({ length: DEFAULT_LIMITS.today }, () => mk({ impact: 'direct' }));
  const r = checkPlacement(tasks, { impact: 'direct', horizon: 'today' });
  assert.deepEqual(codes(r), ['today-full']);
});

test('лимит косвенных на сегодня', () => {
  const tasks = [mk({ impact: 'indirect' }), mk({ impact: 'indirect' }), mk({ impact: 'direct' })];
  const r = checkPlacement(tasks, { impact: 'indirect', horizon: 'today' });
  assert.deepEqual(codes(r), ['indirect-limit']);
  assert.equal(checkPlacement(tasks, { impact: 'direct', horizon: 'today' }).ok, true);
});

test('сама задача не считается при повторной проверке', () => {
  const tasks = [mk({ impact: 'indirect', id: 'a' }), mk({ impact: 'indirect', id: 'b' })];
  assert.equal(checkPlacement(tasks, { impact: 'indirect', horizon: 'today', id: 'a' }).ok, true);
});

test('закрытые задачи в лимит не входят', () => {
  const tasks = Array.from({ length: 5 }, () => mk({ impact: 'direct', status: 'done' }));
  assert.equal(checkPlacement(tasks, { impact: 'direct', horizon: 'today' }).ok, true);
});

test('предупреждение, если на сегодня нет прямых', () => {
  const r = checkPlacement([], { impact: 'indirect', horizon: 'today' });
  assert.equal(r.ok, true);
  assert.equal(r.warnings[0].code, 'no-direct');
});

test('сортировка: прямые, косвенные, шум; ручной порядок внутри', () => {
  const list = [
    mk({ impact: 'noise', id: 'n' }),
    mk({ impact: 'indirect', id: 'i' }),
    mk({ impact: 'direct', id: 'd1' }),
    mk({ impact: 'direct', id: 'd2', order: -1 }),
  ].sort(compareTasks);
  assert.deepEqual(list.map((t) => t.id), ['d2', 'd1', 'i', 'n']);
});

test('перенос в «Сегодня» запоминает день', () => {
  const t = mk({ horizon: 'week' });
  assert.equal(t.todaySince, null);
  const moved = withHorizon(t, 'today', new Date(2026, 8, 25, 10));
  assert.equal(moved.todaySince, '2026-09-25');
  assert.equal(withHorizon(moved, 'month').todaySince, null);
});

test('задача с датой сама приближается к «Сегодня», но не отодвигается', async () => {
  const { promoteDue } = await import('../js/model.js');
  const now = new Date(2026, 8, 25, 9);
  const tasks = [
    mk({ id: 'due', horizon: 'month', dueDate: '2026-09-25' }),
    mk({ id: 'soon', horizon: 'later', dueDate: '2026-09-29' }),
    mk({ id: 'early', horizon: 'today', dueDate: '2026-10-20' }),
    mk({ id: 'plain', horizon: 'week' }),
  ];
  const out = promoteDue(tasks, now);
  const h = Object.fromEntries(out.map((t) => [t.id, t.horizon]));
  assert.deepEqual(h, { due: 'today', soon: 'week', early: 'today', plain: 'week' });
  assert.equal(out.find((t) => t.id === 'due').todaySince, '2026-09-25');
  assert.equal(promoteDue(out, now), out);
});
