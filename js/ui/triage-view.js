// Разбор 80/20: пройти по всем открытым задачам и оставить только то, что двигает цель.

import { esc, icon, toast } from './dom.js';
import { IMPACTS, IMPACT_IDS, horizonLabel, isOpen, compareTasks } from '../model.js';
import { paretoSnapshot, ageDays } from '../stats.js';
import { formatWhen, plural } from '../dates.js';
import * as store from '../store.js';
import { ui, refresh } from './ui-state.js';

const tasksWord = (n) => plural(n, ['задача', 'задачи', 'задач']);

// Сначала то, что вероятнее всего отсечь: шум, потом косвенные, потом прямые; старые — раньше.
function triageOrder(tasks) {
  return tasks
    .filter(isOpen)
    .sort((a, b) => -compareTasks(a, b) || String(a.createdAt).localeCompare(String(b.createdAt)))
    .map((t) => t.id);
}

function paretoBar(snap) {
  if (!snap.total) return '';
  return `<div class="bar tall" role="img" aria-label="Открыто: ${snap.direct} прямых, ${snap.indirect} косвенных, ${snap.noise} шума">
    ${IMPACT_IDS.filter((k) => snap[k]).map((k) => `<i class="seg seg-${k}" style="flex-grow:${snap[k]}"></i>`).join('')}
  </div>
  <div class="legend">${IMPACT_IDS.map((k) => `<span class="key"><span class="dot dot-${k}" aria-hidden="true"></span>${IMPACTS[k].label}: ${snap[k]}</span>`).join('')}</div>`;
}

function renderStart(state) {
  const snap = paretoSnapshot(state.tasks);
  const archived = state.tasks
    .filter((t) => t.status === 'cut' || t.status === 'delegated')
    .sort((a, b) => String(b.cutAt).localeCompare(String(a.cutAt)));
  const delegated = archived.filter((t) => t.status === 'delegated');
  const cut = archived.filter((t) => t.status === 'cut').slice(0, 30);

  return `<section class="triage-start">
    <p class="eyebrow">Разбор 80/20</p>
    <h1>Оставь 20%, которые дают результат</h1>
    <p class="lead">По правилу Парето около 20% задач дают 80% результата. Пройди по списку и на каждую ответь, двигает ли она цель. Остальное отсеки или передай.</p>

    <div class="pareto">
      <div class="pareto-fig">
        <span class="pareto-num">${snap.total}</span>
        <span class="pareto-cap">открыто ${tasksWord(snap.total)}</span>
      </div>
      ${icon.arrow(22)}
      <div class="pareto-fig">
        <span class="pareto-num">≈${snap.total ? snap.vital : 0}</span>
        <span class="pareto-cap">должно остаться</span>
      </div>
    </div>
    ${paretoBar(snap)}

    ${
      snap.total
        ? `<button type="button" class="btn primary big" data-action="start">Начать разбор</button>`
        : '<p class="empty">Открытых задач нет. Разбирать нечего.</p>'
    }
  </section>

  ${
    delegated.length
      ? `<section class="archive">
          <h2>Делегировано · ${delegated.length}</h2>
          <ul>${delegated
            .map(
              (t) => `<li data-id="${t.id}">
                <span class="archive-title">${esc(t.title)}<small>${icon.user(13)} ${esc(t.delegatedTo || 'кому-то')}</small></span>
                <span class="archive-actions">
                  <button type="button" class="btn small quiet" data-action="restore">Вернуть себе</button>
                  <button type="button" class="btn small quiet" data-action="forget" aria-label="Убрать из списка">${icon.close(16)}</button>
                </span>
              </li>`,
            )
            .join('')}</ul>
        </section>`
      : ''
  }
  ${
    cut.length
      ? `<section class="archive">
          <h2>Отсечено · ${archived.filter((t) => t.status === 'cut').length}</h2>
          <ul>${cut
            .map(
              (t) => `<li data-id="${t.id}">
                <span class="archive-title">${esc(t.title)}<small>${formatWhen(t.cutAt)}</small></span>
                <span class="archive-actions">
                  <button type="button" class="btn small quiet" data-action="restore">Вернуть</button>
                  <button type="button" class="btn small quiet danger" data-action="forget" aria-label="Удалить навсегда">${icon.close(16)}</button>
                </span>
              </li>`,
            )
            .join('')}</ul>
        </section>`
      : ''
  }`;
}

function renderCard(state) {
  const tr = ui.triage;
  const task = state.tasks.find((t) => t.id === tr.queue[tr.index]);
  const goal = state.goal.title ? `«${esc(state.goal.title)}»` : 'твоей цели';
  const age = ageDays(task);
  const pos = tr.index + 1;
  return `<section class="triage">
    <div class="triage-top">
      <span class="triage-pos">${pos} из ${tr.queue.length}</span>
      <button type="button" class="btn small quiet" data-action="finish">Закончить</button>
    </div>
    <div class="progress"><i style="width:${((tr.index / tr.queue.length) * 100).toFixed(1)}%"></i></div>
    <p class="triage-q">Это двигает к ${goal}?</p>
    <article class="triage-card">
      <h2>${esc(task.title)}</h2>
      <p class="triage-meta">
        <span class="tag tag-${task.impact}">сейчас: ${IMPACTS[task.impact].label.toLowerCase()}</span>
        <span class="meta">${horizonLabel(task.horizon)}</span>
        <span class="meta">${age ? `создана ${age} дн. назад` : 'создана сегодня'}</span>
      </p>
      ${task.note ? `<p class="triage-note">${esc(task.note)}</p>` : ''}
    </article>
    ${
      tr.delegating
        ? `<form class="delegate-form" id="triage-delegate">
            <label class="field grow"><span class="field-label">Кому передать</span>
              <input id="triage-who" placeholder="Имя или роль" autocomplete="off" autofocus></label>
            <button type="submit" class="btn primary">Передать</button>
            <button type="button" class="btn quiet" data-action="delegate-cancel">Назад</button>
          </form>`
        : `<div class="triage-actions">
            <button type="button" class="choice choice-direct" data-action="choose" data-choice="direct"><span class="dot dot-direct"></span><b>Да, напрямую</b><small>оставить как прямую</small></button>
            <button type="button" class="choice choice-indirect" data-action="choose" data-choice="indirect"><span class="dot dot-indirect"></span><b>Косвенно</b><small>оставить, но не в приоритете</small></button>
            <button type="button" class="choice" data-action="choose" data-choice="delegate">${icon.user(18)}<b>Делегировать</b><small>пусть сделает другой</small></button>
            <button type="button" class="choice choice-cut" data-action="choose" data-choice="cut">${icon.cut(18)}<b>Отсечь</b><small>не делать совсем</small></button>
          </div>
          <button type="button" class="btn quiet small skip" data-action="choose" data-choice="skip">Пропустить</button>`
    }
  </section>`;
}

function renderResult(state) {
  const r = ui.triageResult;
  const removed = r.cut + r.delegated;
  // Доля от всего списка, с которого начался разбор.
  const pct = r.start ? Math.round((removed / r.start) * 100) : 0;
  const remaining = state.tasks.filter(isOpen);
  const direct = remaining.filter((t) => t.impact === 'direct').sort(compareTasks);
  const verdict =
    pct >= 70
      ? 'Отлично. Список стал коротким, и в нём видно главное.'
      : pct >= 40
        ? 'Хорошее начало. Пройдись ещё раз через пару дней: часть «косвенных» тоже можно отсечь.'
        : 'Отсечено немного. Спроси себя по каждой косвенной: что будет, если её не делать вообще?';
  return `<section class="triage-result">
    <p class="eyebrow">Итог разбора</p>
    <h1>Было ${r.start} → осталось ${remaining.length}</h1>
    <div class="cutmeter" role="img" aria-label="Отсечено ${pct}% при цели 80%">
      <div class="cutmeter-track"><i style="width:${pct}%"></i><span class="cutmeter-goal" style="left:80%"></span></div>
      <div class="cutmeter-scale"><span>Отсечено и передано: <b>${pct}%</b></span><span>цель 80%</span></div>
    </div>
    <p class="lead">${verdict}</p>
    <ul class="result-list">
      <li>Отсечено: <b>${r.cut}</b></li>
      <li>Делегировано: <b>${r.delegated}</b></li>
      <li>Осталось прямых: <b>${direct.length}</b></li>
    </ul>
    ${direct.length ? `<p>Начни с «${esc(direct[0].title)}».</p>` : '<p>Прямых задач не осталось. Добавь хотя бы одну, которая двигает цель.</p>'}
    <div class="row gap">
      <a class="btn primary" href="#tasks">К задачам</a>
      <button type="button" class="btn quiet" data-action="close-result">Ещё раз</button>
    </div>
  </section>`;
}

export function render(state) {
  if (ui.triage) {
    const tr = ui.triage;
    // пропускаем задачи, которые успели закрыть или удалить
    while (tr.index < tr.queue.length && !state.tasks.some((t) => t.id === tr.queue[tr.index] && isOpen(t))) tr.index += 1;
    if (tr.index >= tr.queue.length) finish();
    else return renderCard(state);
  }
  if (ui.triageResult) return renderResult(state);
  return renderStart(state);
}

function finish() {
  const tr = ui.triage;
  ui.triageResult = { start: tr.start, seen: tr.seen, cut: tr.cut, delegated: tr.delegated };
  ui.triage = null;
}

function next() {
  ui.triage.index += 1;
  ui.triage.seen += 1;
  ui.triage.delegating = false;
}

export const actions = {
  start: () => {
    const queue = triageOrder(store.getState().tasks);
    ui.triageResult = null;
    ui.triage = { queue, index: 0, start: queue.length, seen: 0, cut: 0, delegated: 0, delegating: false };
    refresh();
  },
  choose: (el) => {
    const tr = ui.triage;
    const id = tr.queue[tr.index];
    const choice = el.dataset.choice;
    if (choice === 'delegate') {
      tr.delegating = true;
      return refresh();
    }
    next();
    if (choice === 'cut') {
      tr.cut += 1;
      store.cutTask(id); // store перерисует экран
    } else if (choice === 'direct' || choice === 'indirect') {
      store.updateTask(id, { impact: choice });
    } else {
      refresh();
    }
  },
  'delegate-cancel': () => {
    ui.triage.delegating = false;
    refresh();
  },
  finish: () => {
    finish();
    refresh();
  },
  'close-result': () => {
    ui.triageResult = null;
    refresh();
  },
  restore: (el) => {
    const id = el.closest('[data-id]').dataset.id;
    store.restoreTask(id);
    toast('Задача вернулась в список');
  },
  forget: (el) => store.deleteTask(el.closest('[data-id]').dataset.id),
};

export const submit = {
  'triage-delegate': (form) => {
    const who = form.querySelector('#triage-who').value.trim();
    if (!who) return form.querySelector('#triage-who').focus();
    const id = ui.triage.queue[ui.triage.index];
    ui.triage.delegated += 1;
    next();
    store.delegateTask(id, who);
  },
};
