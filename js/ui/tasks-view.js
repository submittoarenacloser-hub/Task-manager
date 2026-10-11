// Главный экран: цель, индикатор фокуса, радар ловушки, горизонты и списки задач.

import { esc, icon, toast } from './dom.js';
import { IMPACTS, IMPACT_IDS, HORIZONS, FILTER_QUESTION, openIn, countByImpact, mainTaskOfDay } from '../model.js';
import { todayLoad } from '../rules.js';
import { doneToday, focusShare, trapStatus, carryOver, directStreak, todayProgress } from '../stats.js';
import { dayKey, formatWhen, formatDayKey, plural, isDayOff, DEFAULT_DAYS_OFF } from '../dates.js';
import { describeRule } from '../repeat.js';
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

const calOf = (state) => ({ daysOff: state.settings.daysOff ?? DEFAULT_DAYS_OFF });
const isOffToday = (state, now) => isDayOff(dayKey(now), calOf(state).daysOff);
const daysWord = (n) => plural(n, ['день', 'дня', 'дней']);

function meter(state, now) {
  const done = countByImpact(doneToday(state.tasks, now));
  const share = focusShare(done);
  const streak = directStreak(state.tasks, now, calOf(state));
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

function dayOffBanner() {
  return `<section class="dayoff" role="status">
    <div class="radar-head">${icon.coffee(18)}<b>Сегодня выходной</b></div>
    <p>Уведомлений о работе нет, и этот день не идёт в счёт. Отдохни: задачи подождут до рабочего дня.</p>
  </section>`;
}

/** Дела по дому на сегодня: отдельный раздел, здесь только ссылка. */
function lifeLine(state, now) {
  const today = dayKey(now);
  const due = state.tasks.filter((t) => t.horizon === 'life' && t.status === 'open' && t.dueDate && t.dueDate <= today).length;
  if (!due) return '';
  return `<a class="life-line" href="#life">${icon.home(18)}<span>Дом: ${due} ${plural(due, ['дело', 'дела', 'дел'])} на сегодня</span>${icon.arrow(16)}</a>`;
}

function guideLine(state) {
  if (state.guideSeen) return '';
  return `<div class="guide-line">
    <a href="#guide">${icon.help(18)}<span>Как пользоваться Вектором: короткий гид</span>${icon.arrow(16)}</a>
    <button type="button" class="icon-btn" data-action="hide-guide" aria-label="Скрыть">${icon.close(16)}</button>
  </div>`;
}

function radar(state, now) {
  if (isOffToday(state, now)) return dayOffBanner();
  const trap = trapStatus(state.tasks, now, calOf(state));
  if (trap.level === 'ok') return '';
  const head = trap.level === 'trap' ? 'Похоже на ловушку занятости' : 'Проверь курс';
  return `<section class="radar radar-${trap.level}" role="status">
    <div class="radar-head">${icon.warn(18)}<b>${head}</b></div>
    <ul>${trap.reasons.map((r) => `<li>${esc(r.message)}</li>`).join('')}</ul>
    ${trap.openDirect.length ? `<a class="btn small" href="#focus">К прямой задаче ${icon.arrow(14)}</a>` : ''}
  </section>`;
}

function carryBanner(state, now) {
  if (isOffToday(state, now)) return ''; // хвосты разберём в рабочий день
  const cal = calOf(state);
  const list = carryOver(state.tasks, now, cal);
  if (!list.length) return '';
  return `<section class="carry">
    <p><b>С прошлых дней осталось ${list.length} ${plural(list.length, ['задача', 'задачи', 'задач'])}.</b> Реши по каждой: оставить, перенести или отсечь.</p>
    <ul class="carry-list">${list
      .map((t) => {
        const p = todayProgress(t, now, cal);
        const label = p.duration > 1 ? `${p.missed} из ${p.duration} дн.` : `${p.missed} дн.`;
        return `<li data-id="${t.id}">
          <span class="dot dot-${t.impact}" aria-hidden="true"></span>
          <span class="carry-title">${esc(t.title)} <small>${label}</small></span>
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

function taskItem(t, now, cal = {}) {
  const done = t.status === 'done';
  const meta = [`<span class="tag tag-${t.impact}">${IMPACTS[t.impact].label}</span>`];
  if (t.repeat) {
    const when = !done && t.dueDate && t.dueDate > dayKey(now) ? ` · ${formatDayKey(t.dueDate, now)}` : '';
    meta.push(`<span class="meta">${icon.repeat(13)} ${describeRule(t.repeat)}${when}</span>`);
  }
  if (!done && t.repeat && t.remindTime) meta.push(`<span class="meta">${icon.bell(13)} ${t.remindTime}</span>`);
  if (!done && !t.repeat && t.remindAt) meta.push(`<span class="meta">${icon.bell(13)} ${formatWhen(t.remindAt, now)}</span>`);
  const duration = t.durationDays ?? 1;
  if (!done && t.horizon === 'today' && t.todaySince) {
    const p = todayProgress(t, now, cal);
    if (duration > 1 && !p.overdue) meta.push(`<span class="meta">${icon.clock(13)} день ${p.day} из ${duration}</span>`);
    else if (duration > 1) meta.push(`<span class="meta meta-stuck">дольше плана: день ${p.day} из ${duration}</span>`);
    else if (p.stuck) meta.push(`<span class="meta meta-stuck">висит ${p.missed} дн.</span>`);
  } else if (!done && duration > 1) {
    meta.push(`<span class="meta">${icon.clock(13)} на ${duration} ${daysWord(duration)}</span>`);
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
  const cal = calOf(state);
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
    ${open.length ? `<ul class="tasks">${open.map((t) => taskItem(t, now, cal)).join('')}</ul>` : `<p class="empty">${EMPTY[h.id]}</p>`}
    ${
      done.length
        ? `<details class="done" data-horizon="${h.id}" ${ui.showDone[h.id] ? 'open' : ''}>
            <summary>Сделано за неделю · ${done.length}</summary>
            <ul class="tasks">${done.map((t) => taskItem(t, now, cal)).join('')}</ul>
          </details>`
        : ''
    }
  </section>`;
}

export function render(state) {
  if (!state.onboarded) return renderOnboarding();
  const now = new Date();
  return `
    ${guideLine(state)}
    ${goalBar(state)}
    ${meter(state, now)}
    ${radar(state, now)}
    ${carryBanner(state, now)}
    ${lifeLine(state, now)}
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
  sample: () => {
    store.loadSample();
    if (!store.getState().guideSeen) location.hash = '#guide';
  },
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
    const next = store.toggleDone(id);
    if (was !== 'open') return;
    const t = store.findTask(id);
    if (next) {
      toast(`Сделано. Следующий раз — ${formatDayKey(next.dueDate)}.`, { tone: 'good' });
    } else if (t.impact === 'direct') {
      toast('Прямая задача сделана. Это и есть движение вперёд.', { tone: 'good' });
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
  'carry-all': () => {
    const state = store.getState();
    store.ackCarry(carryOver(state.tasks, new Date(), calOf(state)).map((t) => t.id));
  },
  'hide-guide': () => store.markGuideSeen(),
};

export const submit = {
  'onboard-form': (form) => {
    const data = new FormData(form);
    const title = String(data.get('title')).trim();
    if (!title) return form.querySelector('#onb-goal').focus();
    store.setGoal({ title, metric: String(data.get('metric')).trim() });
    // новичку — короткий гид по приложению
    if (!store.getState().guideSeen) location.hash = '#guide';
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
