// Фокус-сессия: одна задача, таймер, ничего лишнего.

import { esc, icon, toast } from './dom.js';
import { IMPACTS, openIn, mainTaskOfDay } from '../model.js';
import { FOCUS_PRESETS, remainingMs, formatClock, elapsedMs } from '../focus.js';
import { focusMinutes } from '../stats.js';
import { addDays, startOfDay, formatDuration, MINUTE } from '../dates.js';
import * as store from '../store.js';
import { ui, refresh } from './ui-state.js';

const RING = 2 * Math.PI * 104;

function selectedTask(state) {
  const id = state.focus?.taskId ?? ui.focusTaskId;
  // Во время сессии показываем её задачу, даже если её успели закрыть в списке.
  const byId = id ? state.tasks.find((t) => t.id === id && (state.focus || t.status === 'open')) : null;
  return byId ?? mainTaskOfDay(state.tasks) ?? openIn(state.tasks, 'today')[0] ?? null;
}

export function render(state) {
  const now = new Date();
  const task = selectedTask(state);
  const f = state.focus;
  const today = startOfDay(now);
  const minutes = focusMinutes(state.sessions, today, addDays(today, 1));

  if (!task && !f) {
    return `<section class="focus-empty">
      <p class="eyebrow">Фокус-сессия</p>
      <h1>На сегодня нет задач для фокуса</h1>
      <p class="lead">Выбери одну прямую задачу: ту, что сегодня ближе всего к деньгам и к цели. Добавь её в «Сегодня».</p>
      <a class="btn primary" href="#tasks">К задачам</a>
    </section>`;
  }

  const planned = f ? f.minutes : ui.focusMinutes ?? state.settings.focusMinutes;
  const left = f ? remainingMs(f, now) : planned * MINUTE;
  const finished = f && left === 0;
  const progress = f ? 1 - left / (f.minutes * MINUTE) : 0;
  const status = !f ? 'Готов начать' : finished ? 'Время вышло' : f.running ? 'Идёт сессия' : 'Пауза';

  const others = openIn(state.tasks, 'today').filter((t) => t.id !== task?.id);

  return `<section class="focus">
    <p class="eyebrow">Фокус-сессия</p>
    <h1 class="focus-title">${esc(task?.title ?? 'Задача')}</h1>
    ${task ? `<p class="focus-meta"><span class="tag tag-${task.impact}">${IMPACTS[task.impact].label}</span>${task.impact !== 'direct' ? '<span class="meta">не прямая: держи сессию короткой</span>' : ''}</p>` : ''}

    <div class="dial ${finished ? 'is-finished' : ''} imp-${task?.impact ?? 'direct'}">
      <svg viewBox="0 0 240 240" aria-hidden="true">
        <circle class="dial-track" cx="120" cy="120" r="104"/>
        <circle class="dial-fill" cx="120" cy="120" r="104" stroke-dasharray="${RING.toFixed(1)}" stroke-dashoffset="${(RING * (1 - progress)).toFixed(1)}" data-ring/>
      </svg>
      <div class="dial-text">
        <span class="dial-clock" data-clock>${formatClock(left)}</span>
        <span class="dial-status" data-status>${status}</span>
      </div>
    </div>

    ${
      f
        ? ''
        : `<div class="presets" role="radiogroup" aria-label="Длительность">
            ${FOCUS_PRESETS.map((m) => `<button type="button" role="radio" aria-checked="${m === planned}" class="chip ${m === planned ? 'is-on' : ''}" data-action="preset" data-min="${m}">${m} мин</button>`).join('')}
          </div>`
    }

    <div class="focus-actions">
      ${
        !f
          ? `<button type="button" class="btn primary big" data-action="start">${icon.play(18)} Начать</button>`
          : finished
            ? `<button type="button" class="btn primary big" data-action="done">${icon.check(18)} Сделано</button>
               <button type="button" class="btn big" data-action="again">Ещё круг</button>
               <button type="button" class="btn quiet big" data-action="stop">Завершить</button>`
            : `${f.running
                ? `<button type="button" class="btn big" data-action="pause">${icon.pause(18)} Пауза</button>`
                : `<button type="button" class="btn primary big" data-action="resume">${icon.play(18)} Продолжить</button>`}
               <button type="button" class="btn primary big" data-action="done">${icon.check(18)} Сделано</button>
               <button type="button" class="btn quiet big" data-action="stop">Завершить</button>`
      }
    </div>

    ${
      !f && others.length
        ? `<section class="focus-pick">
            <h2>Другая задача на сегодня</h2>
            <ul>${others
              .map(
                (t) => `<li><button type="button" class="pick-row" data-action="choose" data-id="${t.id}">
                  <span class="dot dot-${t.impact}" aria-hidden="true"></span>${esc(t.title)}
                </button></li>`,
              )
              .join('')}</ul>
          </section>`
        : ''
    }

    <p class="focus-total">Сегодня в фокусе: <b>${formatDuration(minutes.total)}</b>${
      minutes.total ? `, из них на прямые — ${formatDuration(minutes.direct)}` : ''
    }</p>
  </section>`;
}

/** Обновление таймера раз в секунду без полной перерисовки. */
export function tick(state) {
  const f = state.focus;
  if (!f) return;
  const left = remainingMs(f, new Date());
  const clock = document.querySelector('[data-clock]');
  if (!clock) return;
  clock.textContent = formatClock(left);
  const ring = document.querySelector('[data-ring]');
  ring?.setAttribute('stroke-dashoffset', (RING * (left / (f.minutes * MINUTE))).toFixed(1));
  if (left === 0 && !document.querySelector('.dial.is-finished')) refresh();
}

export const actions = {
  preset: (el) => {
    ui.focusMinutes = Number(el.dataset.min);
    refresh();
  },
  choose: (el) => {
    ui.focusTaskId = el.dataset.id;
    refresh();
  },
  start: () => {
    const task = selectedTask(store.getState());
    if (!task) return;
    store.beginFocus(task.id, ui.focusMinutes ?? store.getState().settings.focusMinutes);
  },
  pause: () => store.pauseCurrentFocus(),
  resume: () => store.resumeCurrentFocus(),
  stop: () => {
    const f = store.getState().focus;
    const mins = Math.round(elapsedMs(f) / MINUTE);
    store.endFocus();
    if (mins >= 1) toast(`Записано ${formatDuration(mins)} фокуса`);
  },
  done: () => {
    const state = store.getState();
    const task = state.tasks.find((t) => t.id === state.focus?.taskId);
    store.endFocus({ markDone: true });
    ui.focusTaskId = null;
    toast(task?.impact === 'direct' ? 'Прямая задача сделана. Что следующее?' : 'Сделано.', { tone: 'good' });
  },
  again: () => {
    const f = store.getState().focus;
    store.endFocus();
    store.beginFocus(f.taskId, f.minutes);
  },
};
