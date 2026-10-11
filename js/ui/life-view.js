// Дом и дела: быт, машина, здоровье, платежи. Живёт отдельно от рабочего фокуса:
// без типов задач и лимитов, в статистику работы не входит, напоминает и в выходные.

import { esc, icon, toast } from './dom.js';
import { LIFE_CATEGORIES, categoryLabel, isLife } from '../model.js';
import { REPEAT_PRESETS, normalizeRule, nextOccurrence, describeRule, addDaysKey } from '../repeat.js';
import { dayKey, daysBetweenKeys, formatDayKey, plural, weekdayOfKey } from '../dates.js';
import * as store from '../store.js';
import { ui, refresh } from './ui-state.js';
import { openTaskSheet } from './sheets.js';

// Варианты повтора для быстрого добавления; своё правило задаётся в карточке дела.
const QUICK_REPEATS = REPEAT_PRESETS.filter((p) => p.id !== 'custom' && p.id !== 'weekdays');

/** Подсказки для пустого раздела: типичные дела, которые легко забыть. */
const EXAMPLES = [
  { title: 'Заменить фильтр для воды', category: 'home', repeat: 'quarterly' },
  { title: 'Поменять масло в машине', category: 'car', repeat: 'halfyear' },
  { title: 'Оплатить налоги и коммуналку', category: 'money', repeat: 'monthly' },
  { title: 'Техосмотр и страховка', category: 'car', repeat: 'yearly' },
  { title: 'Плановый визит к стоматологу', category: 'health', repeat: 'halfyear' },
];

const GROUPS = [
  { id: 'now', label: 'Пора сделать', test: (d) => d !== null && d <= 0 },
  { id: 'week', label: 'На этой неделе', test: (d) => d !== null && d > 0 && d <= 7 },
  { id: 'month', label: 'В этом месяце', test: (d) => d !== null && d > 7 && d <= 31 },
  { id: 'later', label: 'Позже', test: (d) => d !== null && d > 31 },
  { id: 'nodate', label: 'Без даты', test: (d) => d === null },
];

function lifeItem(t, today) {
  const done = t.status === 'done';
  const diff = t.dueDate ? daysBetweenKeys(today, t.dueDate) : null;
  const meta = [`<span class="tag tag-life">${categoryLabel(t.category)}</span>`];
  if (!done && t.dueDate) {
    meta.push(
      diff < 0
        ? `<span class="meta meta-stuck">просрочено на ${-diff} ${plural(-diff, ['день', 'дня', 'дней'])}</span>`
        : `<span class="meta">${formatDayKey(t.dueDate)}</span>`,
    );
  }
  if (t.repeat) meta.push(`<span class="meta">${icon.repeat(13)} ${describeRule(t.repeat)}</span>`);
  if (!done && t.remindTime) meta.push(`<span class="meta">${icon.bell(13)} ${t.remindTime}</span>`);
  if (t.note) meta.push(`<span class="meta meta-note">${esc(t.note.split('\n')[0].slice(0, 60))}</span>`);
  return `<li class="task task-life ${done ? 'is-done' : ''}" data-id="${t.id}">
    <button type="button" class="check" data-action="toggle" role="checkbox" aria-checked="${done}" aria-label="${done ? 'Вернуть' : 'Отметить сделанным'}">${icon.check(16)}</button>
    <button type="button" class="task-body" data-action="open">
      <span class="task-title">${esc(t.title)}</span>
      <span class="task-meta">${meta.join('')}</span>
    </button>
  </li>`;
}

function adder() {
  const d = ui.lifeDraft;
  return `<form class="adder" id="life-adder" autocomplete="off">
    <div class="adder-main">
      <input id="life-title" placeholder="Новое дело" value="${esc(d.title)}" maxlength="200" enterkeyhint="done" aria-label="Новое дело">
      <button type="submit" class="btn primary">Добавить</button>
    </div>
    <div class="impact-pick" role="radiogroup" aria-label="Раздел">
      ${LIFE_CATEGORIES.map(
        (c) => `<button type="button" role="radio" class="pick ${d.category === c.id ? 'is-on' : ''}" aria-checked="${d.category === c.id}" data-action="cat" data-cat="${c.id}">${c.label}</button>`,
      ).join('')}
    </div>
    <div class="life-opts">
      <label class="field">
        <span class="field-label">Повтор</span>
        <select id="life-repeat">
          ${QUICK_REPEATS.map((p) => `<option value="${p.id}" ${p.id === d.repeat ? 'selected' : ''}>${p.label}</option>`).join('')}
        </select>
      </label>
      <label class="field">
        <span class="field-label">Когда</span>
        <input type="date" id="life-date" value="${d.date ?? ''}">
      </label>
    </div>
    <p class="adder-hint">Своё правило повтора и время напоминания — в карточке дела.</p>
  </form>`;
}

export function render(state) {
  const today = dayKey();
  const all = state.tasks.filter(isLife);
  const open = all.filter((t) => t.status === 'open');
  const weekAgo = Date.now() - 7 * 864e5;
  const recent = all
    .filter((t) => t.status === 'done' && new Date(t.doneAt).getTime() > weekAgo)
    .sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt)));
  const diffOf = (t) => (t.dueDate ? daysBetweenKeys(today, t.dueDate) : null);
  const byDate = (a, b) => String(a.dueDate ?? '9999').localeCompare(String(b.dueDate ?? '9999')) || a.title.localeCompare(b.title);
  const lifeTime = state.settings.lifeRemindTime;

  const groups = GROUPS.map((g) => ({ ...g, items: open.filter((t) => g.test(diffOf(t))).sort(byDate) })).filter((g) => g.items.length);

  return `<section class="life">
    <p class="eyebrow">Дом и дела</p>
    <h1>Всё, что нельзя забыть</h1>
    <p class="lead">Дом, машина, здоровье, платежи. Этот раздел не входит в рабочий фокус и статистику, а напоминания приходят и в выходные${lifeTime ? `, в день срока в ${lifeTime}` : ''}.</p>
    ${adder()}
    ${
      groups.length
        ? groups
            .map(
              (g) => `<section class="col is-active life-group ${g.id === 'now' ? 'is-now' : ''}">
                <header class="col-head life-head"><h2>${g.label}</h2><span class="col-n">${g.items.length}</span></header>
                <ul class="tasks">${g.items.map((t) => lifeItem(t, today)).join('')}</ul>
              </section>`,
            )
            .join('')
        : `<section class="panel">
            <h2>С чего начать</h2>
            <p class="muted">Дела, которые повторяются раз в месяцы и потому забываются. Нажми, чтобы добавить, потом поправь дату.</p>
            <div class="chips">${EXAMPLES.map(
              (e, i) => `<button type="button" class="chip" data-action="example" data-i="${i}">${e.title} · ${REPEAT_PRESETS.find((p) => p.id === e.repeat).label.toLowerCase()}</button>`,
            ).join('')}</div>
          </section>`
    }
    ${
      recent.length
        ? `<details class="done panel">
            <summary>Сделано за неделю · ${recent.length}</summary>
            <ul class="tasks">${recent.map((t) => lifeItem(t, today)).join('')}</ul>
          </details>`
        : ''
    }
  </section>`;
}

/** Правило повтора из быстрого варианта, первый раз — не раньше даты start. */
function ruleFor(presetId, start) {
  if (presetId === 'none') return { repeat: null, dueDate: start };
  const base = { ...REPEAT_PRESETS.find((p) => p.id === presetId).rule };
  if (base.unit === 'week') base.weekdays = base.weekdays ?? [weekdayOfKey(start)];
  const repeat = normalizeRule({ ...base, anchor: start }, start);
  return { repeat, dueDate: nextOccurrence(repeat, addDaysKey(start, -1)) };
}

function addLife({ title, category, repeatId, date }) {
  const start = date || dayKey();
  const { repeat, dueDate } = ruleFor(repeatId, start);
  // дело без повтора и без даты — просто в список «Без даты»
  return store.addTask({
    title,
    horizon: 'life',
    impact: 'indirect',
    category,
    repeat,
    dueDate: repeat || date ? dueDate : null,
  });
}

const taskId = (el) => el.closest('[data-id]')?.dataset.id;

export const actions = {
  cat: (el) => {
    ui.lifeDraft.category = el.dataset.cat;
    document.querySelectorAll('#life-adder [data-action="cat"]').forEach((b) => {
      const on = b.dataset.cat === ui.lifeDraft.category;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    });
  },
  toggle: (el) => {
    const id = taskId(el);
    const was = store.findTask(id)?.status;
    const next = store.toggleDone(id);
    if (was === 'open') toast(next ? `Сделано. Следующий раз — ${formatDayKey(next.dueDate)}.` : 'Сделано.', { tone: 'good' });
  },
  open: (el) => openTaskSheet(taskId(el)),
  example: (el) => {
    const e = EXAMPLES[Number(el.dataset.i)];
    const task = addLife({ title: e.title, category: e.category, repeatId: e.repeat, date: null });
    toast(`Добавлено: ${esc(e.title)}. Проверь дату в карточке.`, {
      action: { label: 'Открыть', run: () => openTaskSheet(task.id) },
    });
  },
};

export const submit = {
  'life-adder': (form) => {
    const title = ui.lifeDraft.title.trim();
    if (!title) return form.querySelector('#life-title').focus();
    const task = addLife({
      title,
      category: ui.lifeDraft.category,
      repeatId: form.querySelector('#life-repeat').value,
      date: form.querySelector('#life-date').value || null,
    });
    ui.lifeDraft = { ...ui.lifeDraft, title: '', repeat: 'none', date: null };
    refresh();
    document.getElementById('life-title')?.focus();
    if (task.repeat) toast(`Повтор: ${describeRule(task.repeat)}. Первый раз — ${formatDayKey(task.dueDate)}.`);
  },
};

export function onInput(e) {
  if (e.target.id === 'life-title') ui.lifeDraft.title = e.target.value;
  if (e.target.id === 'life-repeat') ui.lifeDraft.repeat = e.target.value;
  if (e.target.id === 'life-date') ui.lifeDraft.date = e.target.value || null;
}
