// Листы: редактирование задачи, проверка правил фокуса, цель, делегирование.

import { esc, icon, openSheet, toast } from './dom.js';
import { IMPACTS, IMPACT_IDS, HORIZONS, FILTER_QUESTION } from '../model.js';
import { checkPlacement } from '../rules.js';
import { addDays, atTime, toLocalInput, formatWhen, HOUR } from '../dates.js';
import * as store from '../store.js';
import { ui } from './ui-state.js';

/**
 * Проверяет правила фокуса перед постановкой задачи в горизонт.
 * Возвращает промис с решением: id горизонта, 'cut' или null (отмена).
 */
export function guardPlacement({ impact, horizon, id = null }) {
  const state = store.getState();
  const check = checkPlacement(state.tasks, { impact, horizon, id }, state.settings.limits);
  if (check.ok) {
    if (check.warnings.length) toast(esc(check.warnings[0].message), { tone: 'warn' });
    return Promise.resolve(horizon);
  }
  const noise = check.blockers.some((b) => b.code === 'noise-today');
  const choices = noise
    ? [
        { value: 'cut', label: 'Отсечь сразу', kind: 'primary' },
        { value: 'later', label: 'Положить в «Потом»' },
        { value: horizon, label: 'Всё равно в «Сегодня»', kind: 'quiet' },
      ]
    : [
        { value: 'week', label: 'Положить в «Неделю»', kind: 'primary' },
        { value: horizon, label: 'Всё равно в «Сегодня»', kind: 'quiet' },
      ];

  return new Promise((resolve) => {
    let decided = false;
    openSheet(
      `<div class="sheet-body rule-sheet">
        <header class="sheet-head">
          <p class="eyebrow">Правило фокуса</p>
          <h2>Сегодня — только главное</h2>
        </header>
        <ul class="rule-list">${check.blockers.map((b) => `<li>${esc(b.message)}</li>`).join('')}</ul>
        <div class="sheet-actions stack">
          ${choices
            .map((c) => `<button type="button" class="btn ${c.kind ?? ''}" data-choice="${c.value}">${c.label}</button>`)
            .join('')}
          <button type="button" class="btn quiet" data-close>Отмена</button>
        </div>
      </div>`,
      (dialog, close) => {
        dialog.querySelectorAll('[data-choice]').forEach((btn) =>
          btn.addEventListener('click', () => {
            decided = true;
            close();
            resolve(btn.dataset.choice);
          }),
        );
        // Событие close приходит асинхронно: если этот лист открыт сразу после
        // закрытия другого, первым придёт запоздалое close от прежнего листа.
        const onClose = () => {
          if (dialog.open) return;
          dialog.removeEventListener('close', onClose);
          if (!decided) resolve(null);
        };
        dialog.addEventListener('close', onClose);
      },
    );
  });
}

const segmented = (name, items, current) =>
  `<div class="segmented" role="radiogroup">${items
    .map(
      (it) => `<label class="seg-opt ${it.cls ?? ''}">
        <input type="radio" name="${name}" value="${it.id}" ${it.id === current ? 'checked' : ''}>
        <span>${it.label}</span>
      </label>`,
    )
    .join('')}</div>`;

function quickTimes(now = new Date()) {
  const inHour = new Date(Math.ceil((now.getTime() + HOUR) / (15 * 60_000)) * 15 * 60_000);
  const list = [{ label: 'Через час', at: inHour }];
  const evening = atTime(now, '18:00');
  if (evening > now) list.push({ label: 'Сегодня 18:00', at: evening });
  list.push({ label: 'Завтра 09:00', at: atTime(addDays(now, 1), '09:00') });
  return list;
}

export function openTaskSheet(id) {
  const task = store.findTask(id);
  if (!task) return;
  const now = new Date();
  const impacts = IMPACT_IDS.map((k) => ({ id: k, label: IMPACTS[k].label, cls: `imp-${k}` }));

  openSheet(
    `<form class="sheet-body" id="task-form" novalidate>
      <header class="sheet-head row">
        <p class="eyebrow">Задача</p>
        <button type="button" class="icon-btn" data-close aria-label="Закрыть">${icon.close()}</button>
      </header>
      <label class="field">
        <span class="field-label">Название</span>
        <input id="edit-title" name="title" value="${esc(task.title)}" required maxlength="200" autocomplete="off">
      </label>
      <label class="field">
        <span class="field-label">Заметка</span>
        <textarea id="edit-note" name="note" rows="2" placeholder="Первый шаг, ссылка, детали">${esc(task.note)}</textarea>
      </label>
      <fieldset class="field">
        <legend class="field-label">${FILTER_QUESTION}</legend>
        ${segmented('impact', impacts, task.impact)}
        <p class="field-hint" id="impact-hint">${esc(IMPACTS[task.impact].hint)}</p>
      </fieldset>
      <fieldset class="field">
        <legend class="field-label">Когда</legend>
        ${segmented('horizon', HORIZONS, task.horizon)}
      </fieldset>
      <fieldset class="field">
        <legend class="field-label">Напомнить</legend>
        <div class="remind-row">
          <input type="datetime-local" id="edit-remind" name="remindAt" value="${task.remindAt ? toLocalInput(task.remindAt) : ''}">
          <button type="button" class="btn quiet small" data-remind="">Без напоминания</button>
        </div>
        <div class="chips">${quickTimes(now)
          .map((q) => `<button type="button" class="chip" data-remind="${toLocalInput(q.at)}">${q.label}</button>`)
          .join('')}</div>
      </fieldset>
      <div class="delegate-row" id="delegate-row" hidden>
        <label class="field grow">
          <span class="field-label">Кому передать</span>
          <input id="edit-delegate" placeholder="Имя или роль" autocomplete="off">
        </label>
        <button type="button" class="btn" data-act="delegate-confirm">Передать</button>
      </div>
      <div class="sheet-tools">
        <button type="button" class="btn quiet small" data-act="focus">${icon.play(16)} Фокус-сессия</button>
        <button type="button" class="btn quiet small" data-act="delegate">${icon.user(16)} Делегировать</button>
        <button type="button" class="btn quiet small danger" data-act="cut">${icon.cut(16)} Отсечь</button>
      </div>
      <footer class="sheet-foot">
        <button type="button" class="btn quiet" data-close>Отмена</button>
        <button type="submit" class="btn primary">Сохранить</button>
      </footer>
    </form>`,
    (dialog, close) => {
      const form = dialog.querySelector('#task-form');
      const remind = form.querySelector('#edit-remind');
      form.addEventListener('change', (e) => {
        if (e.target.name === 'impact') {
          form.querySelector('#impact-hint').textContent = IMPACTS[e.target.value].hint;
        }
      });
      form.querySelectorAll('[data-remind]').forEach((b) =>
        b.addEventListener('click', () => {
          remind.value = b.dataset.remind;
        }),
      );
      form.querySelector('[data-act="focus"]').addEventListener('click', () => {
        close();
        ui.focusTaskId = id;
        location.hash = '#focus';
      });
      form.querySelector('[data-act="cut"]').addEventListener('click', () => {
        close();
        cutWithUndo(id);
      });
      form.querySelector('[data-act="delegate"]').addEventListener('click', () => {
        const row = form.querySelector('#delegate-row');
        row.hidden = false;
        row.querySelector('input').focus();
      });
      form.querySelector('[data-act="delegate-confirm"]').addEventListener('click', () => {
        const who = form.querySelector('#edit-delegate').value.trim();
        if (!who) return form.querySelector('#edit-delegate').focus();
        close();
        store.delegateTask(id, who);
        toast(`Передано: ${esc(who)}. Задача ушла из твоих списков.`, {
          action: { label: 'Вернуть', run: () => store.restoreTask(id) },
        });
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = new FormData(form);
        const title = String(data.get('title')).trim();
        if (!title) return form.querySelector('#edit-title').focus();
        const impact = data.get('impact');
        let horizon = data.get('horizon');
        const current = store.findTask(id);
        const needsCheck = horizon === 'today' && (current.horizon !== 'today' || current.impact !== impact);
        close();
        if (needsCheck) {
          const decision = await guardPlacement({ impact, horizon, id });
          if (!decision) return;
          if (decision === 'cut') return cutWithUndo(id);
          horizon = decision;
        }
        const remindValue = String(data.get('remindAt') || '');
        store.updateTask(id, {
          title,
          note: String(data.get('note') || '').trim(),
          impact,
          horizon,
          remindAt: remindValue ? new Date(remindValue).toISOString() : null,
        });
        if (remindValue && !store.getState().settings.notify.enabled) {
          toast('Напоминание сохранено. Включи уведомления в настройках, чтобы оно пришло.', {
            action: { label: 'Настройки', run: () => (location.hash = '#settings') },
            timeout: 7000,
          });
        } else if (remindValue) {
          toast(`Напомню ${formatWhen(remindValue)}`);
        }
      });
    },
  );
}

export function cutWithUndo(id) {
  store.cutTask(id);
  toast('Отсечено. Меньше задач — больше фокуса.', {
    action: { label: 'Вернуть', run: () => store.restoreTask(id) },
  });
}

export function openGoalSheet() {
  const { goal } = store.getState();
  openSheet(
    `<form class="sheet-body" id="goal-form">
      <header class="sheet-head row">
        <p class="eyebrow">Главная цель</p>
        <button type="button" class="icon-btn" data-close aria-label="Закрыть">${icon.close()}</button>
      </header>
      <p class="sheet-lead">По этой цели приложение делит задачи на прямые, косвенные и шум. Сформулируй её через результат, который можно посчитать.</p>
      <label class="field">
        <span class="field-label">Цель</span>
        <input id="goal-title" name="title" value="${esc(goal.title)}" placeholder="Например: 10 новых клиентов в месяц" autocomplete="off" autofocus>
      </label>
      <label class="field">
        <span class="field-label">Чем меряю результат</span>
        <input id="goal-metric" name="metric" value="${esc(goal.metric)}" placeholder="деньги, клиенты, продажи" autocomplete="off">
      </label>
      <footer class="sheet-foot">
        <button type="button" class="btn quiet" data-close>Отмена</button>
        <button type="submit" class="btn primary">Сохранить</button>
      </footer>
    </form>`,
    (dialog, close) => {
      dialog.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const data = new FormData(e.target);
        store.setGoal({ title: String(data.get('title')).trim(), metric: String(data.get('metric')).trim() });
        close();
      });
    },
  );
}

