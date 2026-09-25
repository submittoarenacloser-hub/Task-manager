// Фокус-сессия по Помодоро: круги фокуса с перерывами на одну задачу.

import { esc, icon, toast } from './dom.js';
import { IMPACTS, openIn, mainTaskOfDay } from '../model.js';
import {
  FOCUS_OPTIONS,
  BREAK_OPTIONS,
  TOTAL_OPTIONS,
  buildPlan,
  summarizePlan,
  position,
  focusEndsAt,
  focusMinutesDone,
  formatClock,
} from '../focus.js';
import { focusMinutes } from '../stats.js';
import { addDays, startOfDay, formatDuration, formatTime, formatDayKey, plural, MINUTE } from '../dates.js';
import * as store from '../store.js';
import { ui, refresh } from './ui-state.js';

const RING = 2 * Math.PI * 104;

const TOTAL_LABELS = { 0: '1 круг', 60: '1 ч', 90: '1,5 ч', 120: '2 ч', 180: '3 ч', 240: '4 ч' };

function selectedTask(state) {
  const id = state.focus?.taskId ?? ui.focusTaskId;
  // Во время сессии показываем её задачу, даже если её успели закрыть в списке.
  const byId = id ? state.tasks.find((t) => t.id === id && (state.focus || t.status === 'open')) : null;
  return byId ?? mainTaskOfDay(state.tasks) ?? openIn(state.tasks, 'today')[0] ?? null;
}

const chips = (key, options, current, label, disabled = false) => `
  <div class="pomo-row">
    <span class="pomo-label">${label}</span>
    <div class="chips" role="radiogroup" aria-label="${label}">
      ${options
        .map(
          (v) => `<button type="button" role="radio" class="chip ${v === current ? 'is-on' : ''}" aria-checked="${v === current}"
            data-action="pomo" data-key="${key}" data-val="${v}" ${disabled ? 'disabled' : ''}>${key === 'total' ? TOTAL_LABELS[v] : `${v} мин`}</button>`,
        )
        .join('')}
    </div>
  </div>`;

/** Полоса этапов: круги фокуса и перерывы в масштабе их длительности. */
function strip(plan, p, impact) {
  return `<div class="pstrip imp-${impact}" aria-hidden="true">${plan
    .map((s, i) => {
      const fill = !p ? 0 : i < p.index || p.finished ? 1 : i === p.index ? p.segmentProgress : 0;
      return `<span class="pseg pseg-${s.kind}" style="flex-grow:${s.minutes}"><i data-seg="${i}" style="width:${(fill * 100).toFixed(1)}%"></i></span>`;
    })
    .join('')}</div>`;
}

/** «3 круга по 50 мин и 2 перерыва по 10 мин. Всего 2 ч 50 мин, закончишь в 13:50.» */
function planSummary(plan, pom) {
  const sum = summarizePlan(plan);
  const end = formatTime(new Date(Date.now() + sum.totalMinutes * MINUTE));
  if (sum.rounds === 1) return `Один круг фокуса, ${formatDuration(sum.focusMinutes)}. Закончишь в ${end}.`;
  const equal = plan.every((s) => s.kind !== 'focus' || s.minutes === pom.focus);
  const rounds = equal
    ? `${sum.rounds} ${plural(sum.rounds, ['круг', 'круга', 'кругов'])} по ${pom.focus} мин`
    : `${sum.rounds} ${plural(sum.rounds, ['круг', 'круга', 'кругов'])} фокуса (${formatDuration(sum.focusMinutes)})`;
  const breaks = `${sum.breaks} ${plural(sum.breaks, ['перерыв', 'перерыва', 'перерывов'])} по ${pom.brk} мин`;
  return `${rounds} и ${breaks}. Всего ${formatDuration(sum.totalMinutes)}, закончишь в ${end}.`;
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

  const impact = task?.impact ?? 'direct';
  const pom = state.settings.pomodoro;
  const plan = f ? f.plan : buildPlan(pom);
  const p = f ? position(f, now) : null;
  const onBreak = p && !p.finished && p.segment.kind === 'break';
  const left = p ? p.segmentRemainingMs : plan[0].minutes * MINUTE;
  const progress = p ? p.segmentProgress : 0;
  const eyebrow = !p
    ? 'Фокус-сессия'
    : p.finished
      ? 'Сессия окончена'
      : onBreak
        ? 'Перерыв'
        : `Фокус · круг ${p.round} из ${p.rounds}`;
  const status = !f
    ? 'Готов начать'
    : p.finished
      ? 'Время вышло'
      : !f.running
        ? 'Пауза'
        : onBreak
          ? 'Встань и пройдись'
          : 'Идёт фокус';
  const ends = focusEndsAt(f);
  const next = p && !p.finished ? plan[p.index + 1] : null;
  const skipLabel = onBreak ? 'Пропустить перерыв' : next ? 'Сразу на перерыв' : '';
  const others = openIn(state.tasks, 'today').filter((t) => t.id !== task?.id);

  return `<section class="focus">
    <p class="eyebrow">${eyebrow}</p>
    <h1 class="focus-title">${esc(task?.title ?? 'Задача')}</h1>
    ${task ? `<p class="focus-meta"><span class="tag tag-${task.impact}">${IMPACTS[task.impact].label}</span>${task.impact !== 'direct' ? '<span class="meta">не прямая: держи сессию короткой</span>' : ''}</p>` : ''}

    <div class="dial ${p?.finished ? 'is-finished' : ''} ${onBreak ? 'is-break' : `imp-${impact}`}" data-index="${p?.index ?? -1}">
      <svg viewBox="0 0 240 240" aria-hidden="true">
        <circle class="dial-track" cx="120" cy="120" r="104"/>
        <circle class="dial-fill" cx="120" cy="120" r="104" stroke-dasharray="${RING.toFixed(1)}" stroke-dashoffset="${(RING * (1 - progress)).toFixed(1)}" data-ring/>
      </svg>
      <div class="dial-text">
        <span class="dial-clock" data-clock>${formatClock(left)}</span>
        <span class="dial-status">${status}</span>
      </div>
    </div>

    ${
      f
        ? `${strip(plan, p, impact)}
           <p class="pomo-sum">${
             p.finished
               ? `${formatDuration(focusMinutesDone(f, now))} фокуса за сессию.`
               : ends
                 ? `Закончишь в ${formatTime(ends)}.`
                 : 'Таймер на паузе.'
           }</p>`
        : `<div class="pomo">
            ${chips('focus', FOCUS_OPTIONS, pom.focus, 'Фокус')}
            ${chips('brk', BREAK_OPTIONS, pom.brk, 'Перерыв', !pom.total)}
            ${chips('total', TOTAL_OPTIONS, pom.total, 'Всего')}
          </div>
          ${strip(plan, null, impact)}
          <p class="pomo-sum">${planSummary(plan, pom)}</p>`
    }

    <div class="focus-actions">
      ${
        !f
          ? `<button type="button" class="btn primary big" data-action="start">${icon.play(18)} Начать</button>`
          : p.finished
            ? `<button type="button" class="btn primary big" data-action="done">${icon.check(18)} Сделано</button>
               <button type="button" class="btn big" data-action="again">Ещё сессия</button>
               <button type="button" class="btn quiet big" data-action="stop">Завершить</button>`
            : `${f.running
                ? `<button type="button" class="btn big" data-action="pause">${icon.pause(18)} Пауза</button>`
                : `<button type="button" class="btn primary big" data-action="resume">${icon.play(18)} Продолжить</button>`}
               <button type="button" class="btn primary big" data-action="done">${icon.check(18)} Сделано</button>
               ${skipLabel ? `<button type="button" class="btn big" data-action="skip">${skipLabel}</button>` : ''}
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

/** Обновление раз в секунду без полной перерисовки; при смене этапа — перерисовка. */
export function tick(state) {
  const f = state.focus;
  const dial = document.querySelector('.dial');
  if (!f || !dial) return;
  const p = position(f, new Date());
  if (dial.dataset.index !== String(p.index) || p.finished !== dial.classList.contains('is-finished')) {
    refresh();
    return;
  }
  document.querySelector('[data-clock]').textContent = formatClock(p.segmentRemainingMs);
  document.querySelector('[data-ring]')?.setAttribute('stroke-dashoffset', (RING * (1 - p.segmentProgress)).toFixed(1));
  const seg = document.querySelector(`[data-seg="${p.index}"]`);
  if (seg) seg.style.width = `${(p.segmentProgress * 100).toFixed(1)}%`;
}

export const actions = {
  pomo: (el) => {
    const pom = { ...store.getState().settings.pomodoro, [el.dataset.key]: Number(el.dataset.val) };
    store.setPomodoro(pom);
  },
  choose: (el) => {
    ui.focusTaskId = el.dataset.id;
    refresh();
  },
  start: () => {
    const task = selectedTask(store.getState());
    if (task) store.beginFocus(task.id);
  },
  pause: () => store.pauseCurrentFocus(),
  resume: () => store.resumeCurrentFocus(),
  skip: () => store.skipFocusSegment(),
  stop: () => {
    const mins = focusMinutesDone(store.getState().focus);
    store.endFocus();
    if (mins >= 1) toast(`Записано ${formatDuration(mins)} фокуса`);
  },
  done: () => {
    const state = store.getState();
    const task = state.tasks.find((t) => t.id === state.focus?.taskId);
    const next = store.endFocus({ markDone: true });
    ui.focusTaskId = null;
    if (next) toast(`Сделано. Следующий раз — ${formatDayKey(next.dueDate)}.`, { tone: 'good' });
    else toast(task?.impact === 'direct' ? 'Прямая задача сделана. Что следующее?' : 'Сделано.', { tone: 'good' });
  },
  again: () => {
    const f = store.getState().focus;
    store.endFocus();
    store.beginFocus(f.taskId);
  },
};
