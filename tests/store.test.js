import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../js/store.js';
import { dayKey } from '../js/dates.js';

beforeEach(() => store.resetAll());

test('добавление, выполнение и возврат задачи', () => {
  const t = store.addTask({ title: '  Позвонить  ', impact: 'direct', horizon: 'today' });
  assert.equal(store.findTask(t.id).title, 'Позвонить');
  store.toggleDone(t.id);
  assert.equal(store.findTask(t.id).status, 'done');
  assert.ok(store.findTask(t.id).doneAt);
  store.toggleDone(t.id);
  assert.equal(store.findTask(t.id).status, 'open');
  assert.equal(store.findTask(t.id).doneAt, null);
});

test('отсечение, делегирование и восстановление', () => {
  const a = store.addTask({ title: 'A', impact: 'noise', horizon: 'later' });
  const b = store.addTask({ title: 'B', impact: 'indirect', horizon: 'week' });
  store.cutTask(a.id);
  store.delegateTask(b.id, ' Аня ');
  assert.equal(store.findTask(a.id).status, 'cut');
  assert.deepEqual([store.findTask(b.id).status, store.findTask(b.id).delegatedTo], ['delegated', 'Аня']);
  store.restoreTask(a.id);
  assert.equal(store.findTask(a.id).status, 'open');
});

test('перенос в «Сегодня» через updateTask ставит todaySince', () => {
  const t = store.addTask({ title: 'A', impact: 'direct', horizon: 'week' });
  store.updateTask(t.id, { horizon: 'today' });
  assert.ok(store.findTask(t.id).todaySince);
});

test('фокус-сессия записывает минуты и может закрыть задачу', () => {
  const t = store.addTask({ title: 'A', impact: 'direct', horizon: 'today' });
  store.beginFocus(t.id, { focus: 50, brk: 10, total: 180 });
  assert.equal(store.getState().focus.taskId, t.id);
  assert.equal(store.getState().focus.plan.length, 5);
  assert.deepEqual(store.getState().settings.pomodoro, { focus: 50, brk: 10, total: 180 });
  store.pauseCurrentFocus();
  assert.equal(store.getState().focus.running, false);
  store.endFocus({ markDone: true });
  const s = store.getState();
  assert.equal(s.focus, null);
  assert.equal(store.findTask(t.id).status, 'done');
  // меньше минуты — сессия не пишется
  assert.equal(s.sessions.length, 0);
});

test('старая настройка длины сессии и старый таймер переносятся', () => {
  const s = store.normalize({ tasks: [], settings: { focusMinutes: 45 }, focus: { taskId: 'x', minutes: 25, elapsedMs: 0, running: false } });
  assert.equal(s.settings.pomodoro.focus, 45);
  assert.equal('focusMinutes' in s.settings, false);
  assert.deepEqual(s.focus.plan, [{ kind: 'focus', minutes: 25 }]);
});

test('normalize дополняет старые данные', () => {
  const s = store.normalize({ tasks: [{ id: 'x', title: 'X', impact: 'direct', horizon: 'today', status: 'open' }, { bad: true }], settings: { notify: { enabled: true, morning: { time: '07:00' } } } });
  assert.equal(s.tasks.length, 1);
  assert.equal(s.settings.notify.enabled, true);
  assert.deepEqual(s.settings.notify.morning, { on: true, time: '07:00' });
  assert.equal(s.settings.limits.today, 5);
});

test('импорт проверяет формат, экспорт читается обратно', () => {
  assert.throws(() => store.importData('{"foo":1}'), /нет списка задач/);
  store.addTask({ title: 'A', impact: 'direct', horizon: 'today' });
  const json = store.exportData();
  store.resetAll();
  store.importData(json);
  assert.equal(store.getState().tasks.length, 1);
  assert.equal(store.getState().onboarded, true);
});

test('пример данных загружается целиком', () => {
  store.loadSample();
  const s = store.getState();
  assert.ok(s.goal.title);
  assert.ok(s.tasks.some((t) => t.status === 'done'));
  assert.ok(s.tasks.every((t) => !t.doneAt || new Date(t.doneAt) <= new Date()));
});

test('повторяющаяся задача: при выполнении появляется следующий раз', () => {
  const t = store.addTask({ title: 'Зарядка', impact: 'indirect', horizon: 'today' });
  const today = dayKey();
  const rule = { unit: 'day', every: 1, anchor: today };
  store.updateTask(t.id, { repeat: rule, dueDate: today, remindTime: '08:00' });
  const next = store.toggleDone(t.id);
  assert.ok(next);
  assert.equal(store.findTask(t.id).status, 'done');
  assert.equal(store.findTask(t.id).nextId, next.id);
  const n = store.findTask(next.id);
  assert.equal(n.status, 'open');
  assert.ok(n.dueDate > today);
  assert.equal(n.horizon, 'week');
  assert.equal(n.remindTime, '08:00');
  assert.deepEqual(n.repeat, rule);
  // Вернули в работу — следующий раз убирается
  store.toggleDone(t.id);
  assert.equal(store.findTask(t.id).status, 'open');
  assert.equal(store.findTask(next.id), null);
});

test('пропуск раза переносит дату, обычная задача при выполнении не множится', () => {
  const today = dayKey();
  const t = store.addTask({ title: 'Отчёт', impact: 'direct', horizon: 'today' });
  store.updateTask(t.id, { repeat: { unit: 'month', every: 3, anchor: today }, dueDate: today });
  const date = store.skipOccurrence(t.id);
  assert.ok(date > today);
  assert.equal(store.findTask(t.id).dueDate, date);
  assert.equal(store.findTask(t.id).horizon, 'later');

  const plain = store.addTask({ title: 'Разово', impact: 'direct', horizon: 'today' });
  assert.equal(store.toggleDone(plain.id), null);
  assert.equal(store.getState().tasks.filter((x) => x.title === 'Разово').length, 1);
});
