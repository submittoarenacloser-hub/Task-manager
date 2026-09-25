// Главный экран: цель, индикатор фокуса, радар ловушки, горизонты и списки задач.

import { esc, icon, toast } from './dom.js';
import { IMPACTS, IMPACT_IDS, HORIZONS, FILTER_QUESTION, openIn, countByImpact, mainTaskOfDay } from '../model.js';
import { todayLoad } from '../rules.js';
import { doneToday, focusShare, trapStatus, carryOver, directStreak } from '../stats.js';
import { dayKey, daysBetweenKeys, formatWhen, plural } from '../dates.js';
import * as store from '../store.js';
import { ui, refresh } from './ui-state.js';
import { guardPlacement, openTaskSheet, cutWithUndo, openGoalSheet } from './sheets.js';

const EMPTY = {
  today: 'На сегодня пусто. Добавь одну прямую задачу — ту, что ближе всего к деньгам.',
  week: 'Задачи на эту неделю. Прямые отсюда поднимай в «Сегодня».',
  month: 'Крупное на месяц. Разбей на шаги и перенеси ближайший в «Неделю».',
  later: 'Всё несрочное. Раз в неделю разбирай и отсекай лишнее.',
};

const countLabel = (n, impact) => `${n} ${plural(n, IMPACTS[impact].plural)}`;

function renderOnboarding() {
  return `<section class="onboard">
    <p class="eyebrow">Вектор · менеджер задач</p>
    <h1 class="onboard-title">Делай то, что двигает вперёд</h1>
    <p class="lead">Обычный список задач не отличает работу от занятости. Здесь каждая задача проходит фильтр, а приложение следит, чтобы день уходил на прямые задачи.</p>
    <ol class="types">
      ${IMPACT_IDS.map(
        (k) => `<li class="type type-${k}">
          <span class="dot dot-${k}" aria-hidden="true"></span>
          <div><b>${IMPACTS[k].label}</b><span>${IMPACTS[k].hint}</span></div>
        </li>`,
      ).join('')}
    </ol>
    <form class="onboard-form" id="onboard-form">
      <label class="field">
        <span class="field-label">Главная цель сейчас</span>
        <input id="onb-goal" name="title" placeholder="Например: 10 новых клиентов в месяц" autocomplete="off" required>
      </label>
      <label class="field">
        <span class="field-label">Чем меряешь результат</span>
        <input id="onb-metric" name="metric" placeholder="деньги, клиенты, продажи" autocomplete="off">
      </label>
      <div class="row gap">
        <button type="submit" class="btn primary">Начать</button>
        <button type="button" class="btn quiet" data-action="sample">Посмотреть на примере</button>
      </div>
    </form>
  </section>`;
}

function goalBar(state) {
  const { title, metric } = state.goal;
  return `<section class="goal">
    <span class="goal-label">Цель</span>
    <button type="button" class="goal-title" data-action="edit-goal">${title ? esc(title) : 'Задать главную цель'}</button>
    ${metric ? `<span class="goal-metric">меряю: ${esc(metric)}</span>` : ''}
  </section>`;
}

function meter(state, now) {
  const done = countByImpact(doneToday(state.tasks, now));
  const share = focusShare(done);
  const streak = directStreak(state.tasks, now);
  const main = mainTaskOfDay(state.tasks);
  const segs = IMPACT_IDS.filter((k) => done[k])
    .map((k) => `<i class="seg seg-${k}" style="flex-grow:${done[k]}" title="${IMPACTS[k].label}: ${done[k]}"></i>`)
    .join('');
  const legend = IMPACT_IDS.map(
    (k) => `<span class="key"><span class="dot dot-${k}" aria-hidden="true"></span>${countLabel(done[k], k)}</span>`,
  ).join('');
  return `<section class="meter" aria-label="Фокус сегодня">
    <div class="meter-figure">
      <span class="meter-num">${share === null ? '—' : Math.round(share * 100)}</span><span class="meter-unit">%</span>
    </div>
    <div class="meter-body">
      <p class="meter-cap">Фокус сегодня: доля прямых среди сделанного</p>
      <div class="bar" role="img" aria-label="Сделано: ${done.direct} прямых, ${done.indirect} косвенных, ${done.noise} шума">${segs || '<i class="seg seg-empty"></i>'}</div>
      <div class="legend">${legend}</div>
      ${
        done.total === 0 && main
          ? `<p class="meter-next">Начни с «${esc(main.title)}» <a class="link" href="#focus">в фокус ${icon.arrow(14)}</a></p>`
          : ''
      }
      ${streak ? `<p class="meter-streak">Серия: ${streak} ${plural(streak, ['день', 'дня', 'дней'])} подряд с прямой задачей</p>` : ''}
    </div>
  </section>`;
}

function radar(state, now) {
  const trap = trapStatus(state.tasks, now);
  if (trap.level === 'ok') return '';
  const head = trap.level === 'trap' ? 'Похоже на ловушку занятости' : 'Проверь курс';
  return `<section class="radar radar-${trap.level}" role="status">
    <div class="radar-head">${icon.warn(18)}<b>${head}</b></div>
    <ul>${trap.reasons.map((r) => `<li>${esc(r.message)}</li>`).join('')}</ul>
    ${trap.openDirect.length ? `<a class="btn small" href="#focus">К прямой задаче ${icon.arrow(14)}</a>` : ''}
  </section>`;
}

function carryBanner(state, now) {
  const list = carryOver(state.tasks, now);
  if (!list.length) return '';
  const today = dayKey(now);
  return `<section class="carry">
    <p><b>С прошлых дней осталось ${list.length} ${plural(list.length, ['задача', 'задачи', 'задач'])}.</b> Реши по каждой: оставить, перенести или отсечь.</p>
    <ul class="carry-list">${list
      .map((t) => {
        const days = daysBetweenKeys(t.todaySince, today);
        return `<li data-id="${t.id}">
          <span class="dot dot-${t.impact}" aria-hidden="true"></span>
          <span class="carry-title">${esc(t.title)} <small>${days} дн.</small></span>
          <span class="carry-actions">
            <button type="button" class="btn small" data-action="carry-keep">Оставить</button>
            <button type="button" class="btn small quiet" data-action="carry-week">В неделю</button>
            <button type="button" class="btn small quiet danger" data-action="cut" aria-label="Отсечь">${icon.cut(16)}</button>
          </span>
        </li>`;
      })
      .join('')}</ul>
    ${list.length > 1 ? '<button type="button" class="btn small quiet" data-action="carry-all">Оставить все на сегодня</button>' : ''}
  </section>`;
}

function tabs(state) {
  const load = todayLoad(state.tasks, state.settings.limits);
  return `<div class="horizon-tabs" role="tablist" aria-label="Горизонт">${HORIZONS.map((h) => {
    const n = h.id === 'today' ? `${load.total}/${load.limit}` : openIn(state.tasks, h.id).length;
    const active = ui.horizon === h.id;
    return `<button type="button" role="tab" class="htab ${active ? 'is-active' : ''} ${h.id === 'today' && load.total > load.limit ? 'over' : ''}" aria-selected="${active}" data-action="tab" data-horizon="${h.id}">
      <span>${h.label}</span><span class="htab-n">${n}</span>
    </button>`;
  }).join('')}</div>`;
}

function adder() {
  const d = ui.draft;
  const horizon = d.horizon ?? ui.horizon;
  return `<form class="adder" id="adder" autocomplete="off">
    <div class="adder-main">
      <input id="new-title" name="title" placeholder="Новая задача" value="${esc(d.title)}" maxlength="200" enterkeyhint="done" aria-label="Новая задача">
      <button type="submit" class="btn primary">Добавить</button>
    </div>
    <div class="adder-opts">
      <div class="impact-pick" role="radiogroup" aria-label="Тип задачи">
        ${IMPACT_IDS.map(
          (k) => `<button type="button" role="radio" aria-checked="${d.impact === k}" class="pick pick-${k}" data-action="pick-impact" data-impact="${k}">
            <span class="dot dot-${k}" aria-hidden="true"></span>${IMPACTS[k].label}
          </button>`,
        ).join('')}
      </div>
      <label class="horizon-pick">
        <span class="sr-only">Когда</span>
        <select id="new-horizon" name="horizon">
          ${HORIZONS.map((h) => `<option value="${h.id}" ${h.id === horizon ? 'selected' : ''}>${h.label}</option>`).join('')}
        </select>
      </label>
    </div>
    <p class="adder-hint" id="adder-hint">${d.impact ? esc(IMPACTS[d.impact].hint) : FILTER_QUESTION}</p>
  </form>`;
}

function taskItem(t, now) {
  const done = t.status === 'done';
  const meta = [`<span class="tag tag-${t.impact}">${IMPACTS[t.impact].label}</span>`];
  if (!done && t.remindAt) meta.push(`<span class="meta">${icon.bell(13)} ${formatWhen(t.remindAt, now)}</span>`);
  if (!done && t.horizon === 'today' && t.todaySince) {
    const days = daysBetweenKeys(t.todaySince, dayKey(now));
    if (days >= 2) meta.push(`<span class="meta meta-stuck">висит ${days} дн.</span>`);
  }
  if (t.note) meta.push(`<span class="meta meta-note">${esc(t.note.split('\n')[0].slice(0, 60))}</span>`);

  let quick = '';
  if (!done) {
    if (t.impact === 'noise') {
      quick = `<button type="button" class="quick" data-action="cut" aria-label="Отсечь">${icon.cut(18)}</button>`;
    } else if (t.horizon === 'today') {
      quick = `<button type="button" class="quick" data-action="focus" aria-label="Фокус-сессия">${icon.play(16)}</button>`;
    } else {
      quick = `<button type="button" class="quick" data-action="to-today" aria-label="В «Сегодня»">${icon.up(18)}</button>`;
    }
  }
  return `<li class="task task-${t.impact} ${done ? 'is-done' : ''}" data-id="${t.id}">
    <button type="button" class="check" data-action="toggle" role="checkbox" aria-checked="${done}" aria-label="${done ? 'Вернуть в работу' : 'Отметить сделанной'}">${icon.check(16)}</button>
    <button type="button" class="task-body" data-action="open">
      <span class="task-title">${esc(t.title)}</span>
      <span class="task-meta">${meta.join('')}</span>
    </button>
    ${quick}
  </li>`;
}

function column(state, h, now) {
  const open = openIn(state.tasks, h.id);
  const weekAgo = now.getTime() - 7 * 864e5;
  const done = state.tasks
    .filter((t) => t.status === 'done' && t.horizon === h.id && new Date(t.doneAt).getTime() > weekAgo)
    .sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt)));
  const load = h.id === 'today' ? todayLoad(state.tasks, state.settings.limits) : null;
  return `<section class="col ${ui.horizon === h.id ? 'is-active' : ''}" data-horizon="${h.id}" aria-label="${h.label}">
    <header class="col-head">
      <h2>${h.label}</h2>
      <span class="col-n">${load ? `${load.total} из ${load.limit}` : open.length}</span>
    </header>
    ${open.length ? `<ul class="tasks">${open.map((t) => taskItem(t, now)).join('')}</ul>` : `<p class="empty">${EMPTY[h.id]}</p>`}
    ${
      done.length
        ? `<details class="done" data-horizon="${h.id}" ${ui.showDone[h.id] ? 'open' : ''}>
            <summary>Сделано за неделю · ${done.length}</summary>
            <ul class="tasks">${done.map((t) => taskItem(t, now)).join('')}</ul>
          </details>`
        : ''
    }
  </section>`;
}

export function render(state) {
  if (!state.onboarded) return renderOnboarding();
  const now = new Date();
  return `
    ${goalBar(state)}
    ${meter(state, now)}
    ${radar(state, now)}
    ${carryBanner(state, now)}
    <div class="board-wrap">
      ${tabs(state)}
      ${adder()}
      <div class="board">${HORIZONS.map((h) => column(state, h, now)).join('')}</div>
    </div>`;
}

const taskId = (el) => el.closest('[data-id]')?.dataset.id;

async function moveToToday(id) {
  const task = store.findTask(id);
  const decision = await guardPlacement({ impact: task.impact, horizon: 'today', id });
  if (!decision) return;
  if (decision === 'cut') return cutWithUndo(id);
  store.updateTask(id, { horizon: decision });
  if (decision === 'today') toast(`«${esc(task.title)}» — в плане на сегодня`);
}

export const actions = {
  'edit-goal': () => openGoalSheet(),
  sample: () => store.loadSample(),
  tab: (el) => {
    ui.horizon = el.dataset.horizon;
    ui.draft.horizon = null;
    refresh();
  },
  'pick-impact': (el) => {
    ui.draft.impact = ui.draft.impact === el.dataset.impact ? null : el.dataset.impact;
    document.querySelectorAll('.pick').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.impact === ui.draft.impact)));
    document.getElementById('adder-hint').textContent = ui.draft.impact ? IMPACTS[ui.draft.impact].hint : FILTER_QUESTION;
    document.getElementById('adder').classList.remove('need-impact');
  },
  toggle: (el) => {
    const id = taskId(el);
    const was = store.findTask(id)?.status;
    store.toggleDone(id);
    if (was === 'open') {
      const t = store.findTask(id);
      if (t.impact === 'direct') toast('Прямая задача сделана. Это и есть движение вперёд.', { tone: 'good' });
    }
  },
  open: (el) => openTaskSheet(taskId(el)),
  cut: (el) => cutWithUndo(taskId(el)),
  focus: (el) => {
    ui.focusTaskId = taskId(el);
    location.hash = '#focus';
  },
  'to-today': (el) => moveToToday(taskId(el)),
  'carry-keep': (el) => store.ackCarry([taskId(el)]),
  'carry-week': (el) => store.updateTask(taskId(el), { horizon: 'week' }),
  'carry-all': () => store.ackCarry(carryOver(store.getState().tasks).map((t) => t.id)),
};

export const submit = {
  'onboard-form': (form) => {
    const data = new FormData(form);
    const title = String(data.get('title')).trim();
    if (!title) return form.querySelector('#onb-goal').focus();
    store.setGoal({ title, metric: String(data.get('metric')).trim() });
  },
  adder: async (form) => {
    const title = ui.draft.title.trim();
    const input = form.querySelector('#new-title');
    if (!title) return input.focus();
    const impact = ui.draft.impact;
    if (!impact) {
      form.classList.remove('need-impact');
      void form.offsetWidth; // перезапуск анимации подсказки
      form.classList.add('need-impact');
      document.getElementById('adder-hint').textContent = `Выбери тип. ${FILTER_QUESTION}`;
      return;
    }
    const horizon = form.querySelector('#new-horizon').value;
    const decision = await guardPlacement({ impact, horizon });
    if (!decision) return;
    const task = store.addTask({ title, impact, horizon: decision === 'cut' ? 'later' : decision });
    ui.draft = { title: '', impact: null, horizon: ui.draft.horizon };
    if (decision === 'cut') {
      store.cutTask(task.id);
      toast('Отсечено ещё до начала. Так и надо.', { action: { label: 'Вернуть', run: () => store.restoreTask(task.id) } });
    } else if (impact === 'noise') {
      toast(`Шум отправлен в «${HORIZONS.find((h) => h.id === decision).label}». Может, сразу отсечь?`, {
        action: { label: 'Отсечь', run: () => store.cutTask(task.id) },
        timeout: 6000,
      });
    }
    if (decision !== ui.horizon && decision !== 'cut' && window.matchMedia('(max-width: 1099px)').matches) {
      ui.horizon = decision;
    }
    refresh();
    document.getElementById('new-title')?.focus();
  },
};

export function onInput(e) {
  if (e.target.id === 'new-title') ui.draft.title = e.target.value;
  if (e.target.id === 'new-horizon') ui.draft.horizon = e.target.value;
}

export function onToggle(e) {
  const details = e.target.closest?.('details.done');
  if (details) ui.showDone[details.dataset.horizon] = details.open;
}
