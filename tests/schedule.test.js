import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueNotifications, upcoming, DEFAULT_NOTIFY } from '../js/schedule.js';
import { startFocus } from '../js/focus.js';
import { mk, done, FRI } from './helpers.js';

const stateWith = (tasks = [], notify = {}, extra = {}) => ({
  goal: { title: '10 клиентов в месяц' },
  tasks,
  sessions: [],
  focus: null,
  settings: { notify: { ...structuredClone(DEFAULT_NOTIFY), enabled: true, ...notify } },
  ...extra,
});

const kinds = (list) => list.map((n) => n.kind);

test('выключенные уведомления ничего не шлют', () => {
  assert.deepEqual(dueNotifications(stateWith([], { enabled: false }), FRI(9, 5)), []);
});

test('утреннее уведомление называет главную задачу', () => {
  const s = stateWith([mk({ impact: 'direct', title: 'Отправить КП' })]);
  const [n] = dueNotifications(s, FRI(9, 5));
  assert.equal(n.kind, 'morning');
  assert.equal(n.key, 'morning:2026-09-25');
  assert.match(n.title, /Отправить КП/);
});

test('утро без прямых задач спрашивает, что главное', () => {
  const [n] = dueNotifications(stateWith(), FRI(9, 5));
  assert.match(n.body, /10 клиентов в месяц/);
});

test('показанное не повторяется, а слишком старое не догоняет', () => {
  const s = stateWith();
  assert.deepEqual(dueNotifications(s, FRI(9, 5), { 'morning:2026-09-25': 1 }), []);
  assert.deepEqual(kinds(dueNotifications(s, FRI(11, 30))), []);
  assert.deepEqual(kinds(dueNotifications(s, FRI(8, 59))), []);
});

test('вечерний итог считает долю прямых', () => {
  const s = stateWith([done('direct', FRI(10)), done('indirect', FRI(12)), mk({ impact: 'direct' })]);
  const n = dueNotifications(s, FRI(20, 35)).find((x) => x.kind === 'evening');
  assert.match(n.title, /50%/);
  assert.match(n.body, /осталось 1 задача/);
});

test('разбор недели — только в выбранный день', () => {
  const s = stateWith([], { weekly: { on: true, day: 0, time: '18:00' } });
  assert.ok(!kinds(dueNotifications(s, FRI(18, 5))).includes('weekly'));
  const sunday = new Date(2026, 8, 27, 18, 5);
  assert.ok(kinds(dueNotifications(s, sunday)).includes('weekly'));
});

test('напоминание по задаче', () => {
  const t = mk({ title: 'Созвон', remindAt: FRI(15).toISOString() });
  const s = stateWith([t]);
  assert.ok(!kinds(dueNotifications(s, FRI(14, 59))).includes('reminder'));
  const n = dueNotifications(s, FRI(15, 1)).find((x) => x.kind === 'reminder');
  assert.equal(n.title, 'Созвон');
  // закрытая задача не напоминает
  assert.ok(!kinds(dueNotifications(stateWith([{ ...t, status: 'done' }]), FRI(15, 1))).includes('reminder'));
});

test('конец фокус-сессии', () => {
  const t = mk({ id: 'f1' });
  const s = stateWith([t], {}, { focus: startFocus('f1', 25, FRI(15)) });
  assert.ok(!kinds(dueNotifications(s, FRI(15, 24))).includes('focus'));
  assert.ok(kinds(dueNotifications(s, FRI(15, 25))).includes('focus'));
});

test('сигнал ловушки на третьей косвенной подряд', () => {
  const tasks = [mk({ impact: 'direct' }), done('indirect', FRI(13)), done('indirect', FRI(13, 30))];
  const s = stateWith(tasks, { midday: { on: false, time: '13:30' } });
  assert.ok(!kinds(dueNotifications(s, FRI(14))).includes('trap'));
  tasks.push(done('noise', FRI(13, 50)));
  const n = dueNotifications(s, FRI(14)).find((x) => x.kind === 'trap');
  assert.equal(n.key, 'trap:2026-09-25:1');
});

test('upcoming отдаёт ближайшие по времени', () => {
  const list = upcoming(stateWith(), FRI(12), 3);
  assert.deepEqual(list.map((x) => x.title), ['Проверка курса', 'Итог дня', 'План на день']);
  assert.equal(list[0].when, 'сегодня 13:30');
  assert.equal(list[2].when, 'завтра 09:00');
});
