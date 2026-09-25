import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dailySeries,
  weekSummary,
  directStreak,
  nonDirectStreak,
  trapStatus,
  stuckDirect,
  carryOver,
  paretoSnapshot,
  focusMinutes,
} from '../js/stats.js';
import { addDays, startOfDay } from '../js/dates.js';
import { mk, done, FRI } from './helpers.js';

test('dailySeries раскладывает сделанное по дням', () => {
  const tasks = [done('direct', FRI(10)), done('noise', FRI(11)), done('indirect', addDays(FRI(10), -2))];
  const s = dailySeries(tasks, FRI(), 7);
  assert.equal(s.length, 7);
  assert.equal(s[6].key, '2026-09-25');
  assert.deepEqual([s[6].direct, s[6].noise, s[6].total], [1, 1, 2]);
  assert.equal(s[4].indirect, 1);
});

test('weekSummary: доля фокуса и сравнение с прошлой неделей', () => {
  const tasks = [
    done('direct', FRI(10)),
    done('indirect', addDays(FRI(), -1)),
    done('direct', addDays(FRI(), -9)),
    mk({ status: 'cut', cutAt: addDays(FRI(), -1).toISOString() }),
  ];
  const w = weekSummary(tasks, FRI());
  assert.equal(w.share, 0.5);
  assert.equal(w.prevShare, 1);
  assert.equal(w.cut, 1);
});

test('серия прямых: сегодня пусто — считаем со вчера', () => {
  const tasks = [done('direct', addDays(FRI(), -1)), done('direct', addDays(FRI(), -2)), done('direct', addDays(FRI(), -4))];
  assert.equal(directStreak(tasks, FRI()), 2);
  assert.equal(directStreak([...tasks, done('direct', FRI(9))], FRI()), 3);
});

test('подряд косвенные считаются с последней выполненной', () => {
  const tasks = [done('direct', FRI(9)), done('indirect', FRI(10)), done('noise', FRI(11)), done('indirect', FRI(11, 30))];
  assert.equal(nonDirectStreak(tasks, FRI()), 3);
});

test('радар: три косвенные подряд при открытой прямой — ловушка', () => {
  const tasks = [
    mk({ impact: 'direct', title: 'Позвонить клиенту' }),
    done('indirect', FRI(9)),
    done('indirect', FRI(10)),
    done('noise', FRI(11)),
  ];
  const r = trapStatus(tasks, FRI());
  assert.equal(r.level, 'trap');
  assert.equal(r.reasons[0].code, 'streak');
  assert.match(r.reasons[0].message, /Позвонить клиенту/);
});

test('радар: всё сделанное — прямое, прямых в плане нет → ок', () => {
  const tasks = [done('direct', FRI(9)), done('direct', FRI(10))];
  assert.equal(trapStatus(tasks, FRI()).level, 'ok');
});

test('радар: низкая доля прямых за неделю', () => {
  const tasks = Array.from({ length: 6 }, (_, i) => done(i === 0 ? 'direct' : 'indirect', addDays(FRI(), -i - 1)));
  const r = trapStatus(tasks, FRI());
  assert.equal(r.level, 'trap');
  assert.equal(r.reasons[0].code, 'week');
});

test('радар: в плане на сегодня нет прямых', () => {
  const r = trapStatus([mk({ impact: 'indirect' })], FRI());
  assert.equal(r.level, 'warn');
  assert.equal(r.reasons.at(-1).code, 'no-direct');
});

test('зависшие прямые и хвосты со вчера', () => {
  const tasks = [
    mk({ impact: 'direct', id: 'old', todaySince: '2026-09-22' }),
    mk({ impact: 'indirect', id: 'yday', todaySince: '2026-09-24' }),
    mk({ impact: 'direct', id: 'acked', todaySince: '2026-09-24', carryAck: '2026-09-25' }),
    mk({ impact: 'direct', id: 'fresh', todaySince: '2026-09-25' }),
  ];
  assert.deepEqual(stuckDirect(tasks, FRI()).map((x) => [x.task.id, x.days]), [['old', 3]]);
  assert.deepEqual(carryOver(tasks, FRI()).map((t) => t.id).sort(), ['old', 'yday']);
});

test('paretoSnapshot: сколько оставить по правилу 20%', () => {
  const tasks = [
    ...Array.from({ length: 8 }, () => mk({ impact: 'indirect', horizon: 'week' })),
    mk({ impact: 'direct' }),
    mk({ impact: 'noise', horizon: 'later' }),
    mk({ impact: 'noise', status: 'cut' }),
  ];
  const p = paretoSnapshot(tasks);
  assert.equal(p.total, 10);
  assert.equal(p.vital, 2);
  assert.equal(p.directShare, 0.1);
});

test('focusMinutes суммирует сессии по типам', () => {
  const day = startOfDay(FRI());
  const sessions = [
    { impact: 'direct', minutes: 50, endedAt: FRI(10).toISOString() },
    { impact: 'indirect', minutes: 25, endedAt: FRI(11).toISOString() },
    { impact: 'direct', minutes: 25, endedAt: addDays(FRI(), -1).toISOString() },
  ];
  const m = focusMinutes(sessions, day, addDays(day, 1));
  assert.deepEqual([m.direct, m.indirect, m.total], [50, 25, 75]);
});
