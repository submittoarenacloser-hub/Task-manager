import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueNotifications, plannedNotifications, upcoming, DEFAULT_NOTIFY } from '../js/schedule.js';
import { startFocus, buildPlan } from '../js/focus.js';
import { mk, done, FRI } from './helpers.js';

const stateWith = (tasks = [], notify = {}, extra = {}) => ({
  goal: { title: '10 клиентов в месяц' },
  tasks,
  sessions: [],
  focus: null,
  // без выходных, чтобы проверять расписание само по себе; выходные — в отдельных тестах
  settings: { daysOff: [], notify: { ...structuredClone(DEFAULT_NOTIFY), enabled: true, ...notify } },
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

test('Помодоро: уведомление на каждом переходе', () => {
  const t = mk({ id: 'f1', title: 'Лендинг' });
  const focus = startFocus('f1', buildPlan({ focus: 50, brk: 10, total: 120 }), FRI(15));
  const s = stateWith([t], {}, { focus });
  assert.ok(!kinds(dueNotifications(s, FRI(15, 49))).includes('focus'));
  const brk = dueNotifications(s, FRI(15, 50)).find((n) => n.kind === 'focus');
  assert.equal(brk.title, 'Перерыв 10 мин');
  assert.match(brk.body, /Круг 1 из 2/);
  const back = dueNotifications(s, FRI(16, 0), { [brk.key]: 1 }).find((n) => n.kind === 'focus');
  assert.equal(back.title, 'Перерыв окончен, снова фокус');
  const planned = plannedNotifications(s, FRI(15, 1), 1).filter((n) => n.kind === 'focus');
  assert.deepEqual(planned.map((n) => n.title), ['Перерыв 10 мин', 'Перерыв окончен, снова фокус', 'Фокус-сессия окончена']);
  assert.match(planned[2].body, /Лендинг.*1 ч 40 мин/);
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
  // разбор недели по умолчанию — в пятницу в 17:00
  assert.deepEqual(list.map((x) => x.title), ['Проверка курса', 'Разбор недели (пятница)', 'Итог дня']);
  assert.equal(list[0].when, 'сегодня 13:30');
  assert.equal(list[2].when, 'сегодня 20:30');
});

test('only оставляет только нужные виды (в Android остальное планирует система)', () => {
  const tasks = [mk({ impact: 'direct' }), done('indirect', FRI(9)), done('indirect', FRI(9, 2)), done('noise', FRI(9, 4))];
  const all = dueNotifications(stateWith(tasks), FRI(9, 5));
  assert.deepEqual(kinds(all).sort(), ['morning', 'trap']);
  assert.deepEqual(kinds(dueNotifications(stateWith(tasks), FRI(9, 5), {}, { only: ['trap'] })), ['trap']);
});

test('план на неделю: только будущее, по порядку, с готовым текстом', () => {
  const t = mk({ title: 'Созвон', remindAt: FRI(15).toISOString() });
  const list = plannedNotifications(stateWith([t]), FRI(12), 7);
  assert.ok(list.every((n) => n.at > FRI(12)));
  assert.ok(list.every((n, i) => i === 0 || list[i - 1].at <= n.at));
  assert.deepEqual(list.slice(0, 4).map((n) => n.kind), ['midday', 'reminder', 'weekly', 'evening']);
  // 7 дней × 3 ежедневных (сегодняшнее утро уже прошло) + разбор в пятницу + напоминание
  assert.equal(list.length, 7 * 3 - 1 + 1 + 1);
  assert.ok(list.every((n) => n.title && n.body && n.key));
  assert.deepEqual(plannedNotifications(stateWith([], { enabled: false }), FRI(12)), []);
});

test('текст на будущий день собирается на его дату', () => {
  const s = stateWith([done('direct', FRI(10)), mk({ impact: 'direct' })]);
  const list = plannedNotifications(s, FRI(12), 2);
  const todayEvening = list.find((n) => n.key === 'evening:2026-09-25');
  const tomorrowEvening = list.find((n) => n.key === 'evening:2026-09-26');
  assert.match(todayEvening.title, /100%/);
  assert.match(tomorrowEvening.title, /пока ничего не отмечено/);
});

test('повторяющаяся задача напоминает в каждый свой день', () => {
  const t = mk({
    title: 'Планёрка',
    repeat: { unit: 'week', every: 1, weekdays: [1, 2, 3, 4, 5], anchor: '2026-09-25' },
    dueDate: '2026-09-25',
    remindTime: '10:00',
  });
  const list = plannedNotifications(stateWith([t], { morning: { on: false }, midday: { on: false }, evening: { on: false }, weekly: { on: false } }), FRI(9), 7);
  assert.deepEqual(
    list.map((n) => n.key),
    ['2026-09-25', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'].map((d) => `task:${t.id}:${d}`),
  );
  assert.equal(list[0].at.getHours(), 10);
  const due = dueNotifications(stateWith([t]), FRI(10, 1)).find((n) => n.kind === 'reminder');
  assert.equal(due.title, 'Планёрка');
});

// ——— выходные ———

const withDaysOff = (tasks = [], notify = {}, daysOff = [6, 0]) => {
  const s = stateWith(tasks, notify);
  s.settings.daysOff = daysOff;
  return s;
};
const SAT = (h = 12, m = 0) => new Date(2026, 8, 26, h, m);

test('в выходной рабочие уведомления не приходят', () => {
  const s = withDaysOff([mk({ impact: 'direct' })]);
  assert.deepEqual(dueNotifications(s, SAT(9, 5)), []);
  // план на неделю пропускает субботу и воскресенье
  const days = new Set(plannedNotifications(s, FRI(21), 4).map((n) => n.key.split(':')[1]));
  assert.ok(!days.has('2026-09-26') && !days.has('2026-09-27'));
  assert.ok(days.has('2026-09-28'));
});

test('разбор недели в выходной переезжает на последний рабочий день', async () => {
  const { weeklyReviewDay } = await import('../js/schedule.js');
  assert.equal(weeklyReviewDay(0, [6, 0]), 5);
  assert.equal(weeklyReviewDay(5, [6, 0]), 5);
  assert.equal(weeklyReviewDay(5, [5, 6]), 4);
  const s = withDaysOff([], { weekly: { on: true, day: 0, time: '18:00' } });
  assert.ok(kinds(dueNotifications(s, FRI(18, 5))).includes('weekly'));
});

test('разовое напоминание по работе в субботу приходит в понедельник в то же время', () => {
  const t = mk({ title: 'Отправить счёт', remindAt: SAT(10).toISOString() });
  const list = plannedNotifications(withDaysOff([t]), FRI(20), 4).filter((n) => n.kind === 'reminder');
  assert.equal(list.length, 1);
  assert.equal(list[0].at.getDay(), 1);
  assert.equal(list[0].at.getHours(), 10);
});

test('повторяющаяся рабочая задача не напоминает в выходные', () => {
  const t = mk({ title: 'Зарядка', repeat: { unit: 'day', every: 1, anchor: '2026-09-25' }, dueDate: '2026-09-25', remindTime: '08:00' });
  const dates = plannedNotifications(withDaysOff([t]), FRI(7), 4)
    .filter((n) => n.kind === 'reminder')
    .map((n) => n.key.split(':')[2]);
  assert.deepEqual(dates, ['2026-09-25', '2026-09-28']);
});

test('дела по дому напоминают и в выходные, в общее время для дел', () => {
  const filter = mk({
    title: 'Заменить фильтр воды',
    horizon: 'life',
    category: 'home',
    repeat: { unit: 'month', every: 3, anchor: '2026-09-26' },
    dueDate: '2026-09-26',
  });
  const s = withDaysOff([filter]);
  s.settings.lifeRemindTime = '10:00';
  const n = dueNotifications(s, SAT(10, 1)).find((x) => x.kind === 'reminder');
  assert.equal(n.title, 'Заменить фильтр воды');
  assert.equal(n.url, '#life');
  assert.match(n.body, /Дом/);
  s.settings.lifeRemindTime = null;
  assert.equal(dueNotifications(s, SAT(10, 1)).length, 0);
});
