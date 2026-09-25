// Листы: редактирование задачи, проверка правил фокуса, цель, делегирование.

import { esc, icon, openSheet, toast } from './dom.js';
import { IMPACTS, IMPACT_IDS, HORIZONS, FILTER_QUESTION } from '../model.js';
import { checkPlacement } from '../rules.js';
import { addDays, atTime, toLocalInput, formatWhen, formatDayKey, dayKey, plural, HOUR } from '../dates.js';
import {
  REPEAT_PRESETS,
  REPEAT_UNITS,
  WEEKDAY_ORDER,
  presetOf,
  normalizeRule,
  describeRule,
  nextOccurrence,
  horizonForDate,
  addDaysKey,
} from '../repeat.js';
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

const WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export function openTaskSheet(id) {
  const task = store.findTask(id);
  if (!task) return;
  const now = new Date();
  const today = dayKey(now);
  const impacts = IMPACT_IDS.map((k) => ({ id: k, label: IMPACTS[k].label, cls: `imp-${k}` }));
  const repeating = Boolean(task.repeat);
  const preset = presetOf(task.repeat);
  const custom = task.repeat ?? { unit: 'day', every: 1 };

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
      <fieldset class="field" id="horizon-field" ${repeating ? 'hidden' : ''}>
        <legend class="field-label">Когда</legend>
        ${segmented('horizon', HORIZONS, task.horizon)}
      </fieldset>
      <fieldset class="field">
        <legend class="field-label">Повтор</legend>
        <select id="edit-repeat" aria-label="Повтор">
          ${REPEAT_PRESETS.map((p) => `<option value="${p.id}" ${p.id === preset ? 'selected' : ''}>${p.label}</option>`).join('')}
        </select>
        <div class="repeat-extra" id="repeat-extra" ${repeating ? '' : 'hidden'}>
          <div class="repeat-custom" id="repeat-custom" ${preset === 'custom' ? '' : 'hidden'}>
            <span>Раз в</span>
            <input type="number" id="edit-every" min="1" max="365" inputmode="numeric" value="${custom.every}" aria-label="Сколько">
            <select id="edit-unit" aria-label="Чего">
              ${REPEAT_UNITS.map((u) => `<option value="${u.id}" ${u.id === custom.unit ? 'selected' : ''}>${plural(custom.every, u.forms)}</option>`).join('')}
            </select>
          </div>
          <div class="weekday-pick" id="repeat-days" role="group" aria-label="Дни недели" hidden>
            ${WEEKDAY_ORDER.map((d) => `<button type="button" class="wd" data-wd="${d}" aria-pressed="false">${WD_SHORT[d]}</button>`).join('')}
          </div>
          <label class="field">
            <span class="field-label">Первый раз</span>
            <input type="date" id="edit-start" value="${task.dueDate ?? today}">
          </label>
        </div>
        <p class="field-hint" id="repeat-hint"></p>
      </fieldset>
      <fieldset class="field">
        <legend class="field-label">Напомнить</legend>
        <div id="remind-once" ${repeating ? 'hidden' : ''}>
          <div class="remind-row">
            <input type="datetime-local" id="edit-remind" name="remindAt" value="${task.remindAt ? toLocalInput(task.remindAt) : ''}">
            <button type="button" class="btn quiet small" data-remind="">Без напоминания</button>
          </div>
          <div class="chips">${quickTimes(now)
            .map((q) => `<button type="button" class="chip" data-remind="${toLocalInput(q.at)}">${q.label}</button>`)
            .join('')}</div>
        </div>
        <div class="remind-row" id="remind-repeat" ${repeating ? '' : 'hidden'}>
          <input type="time" id="edit-remind-time" value="${task.remindTime ?? ''}" aria-label="Время напоминания">
          <span class="field-hint">в каждый день повтора</span>
          <button type="button" class="btn quiet small" id="clear-remind-time">Без напоминания</button>
        </div>
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
        ${repeating && task.status === 'open' ? `<button type="button" class="btn quiet small" data-act="skip">${icon.repeat(16)} Пропустить этот раз</button>` : ''}
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
      const $ = (sel) => form.querySelector(sel);
      const remind = $('#edit-remind');
      let weekdays = task.repeat?.weekdays ?? null;

      const startKey = () => $('#edit-start').value || today;
      const weekdayOfStart = () => new Date(`${startKey()}T00:00`).getDay();

      /** Правило из формы или null, если «Не повторять». */
      const readRule = () => {
        const id = $('#edit-repeat').value;
        if (id === 'none') return null;
        const base =
          id === 'custom'
            ? { unit: $('#edit-unit').value, every: Number($('#edit-every').value) || 1 }
            : { ...REPEAT_PRESETS.find((p) => p.id === id).rule };
        if (base.unit === 'week') base.weekdays = weekdays?.length ? weekdays : base.weekdays ?? [weekdayOfStart()];
        // Если первый раз не меняли, сохраняем исходную дату отсчёта (важно для 31-го числа)
        const anchor = task.repeat && startKey() === task.dueDate ? task.repeat.anchor : startKey();
        return normalizeRule({ ...base, anchor }, startKey());
      };

      const syncRepeat = (resetDays = false) => {
        const id = $('#edit-repeat').value;
        const on = id !== 'none';
        $('#repeat-extra').hidden = !on;
        $('#horizon-field').hidden = on;
        $('#remind-once').hidden = on;
        $('#remind-repeat').hidden = !on;
        $('#repeat-custom').hidden = id !== 'custom';
        if (resetDays) {
          weekdays = id === 'weekdays' ? [1, 2, 3, 4, 5] : id === 'weekly' || id === 'custom' ? [weekdayOfStart()] : null;
        }
        const every = Number($('#edit-every').value) || 1;
        $('#edit-unit').querySelectorAll('option').forEach((o) => {
          o.textContent = plural(every, REPEAT_UNITS.find((u) => u.id === o.value).forms);
        });
        const rule = readRule();
        const isWeek = rule?.unit === 'week';
        $('#repeat-days').hidden = !isWeek;
        if (isWeek) {
          weekdays = rule.weekdays;
          form.querySelectorAll('.wd').forEach((b) => b.setAttribute('aria-pressed', String(weekdays.includes(Number(b.dataset.wd)))));
        }
        $('#repeat-hint').textContent = rule
          ? `${capitalize(describeRule(rule))}. Первый раз — ${formatDayKey(nextOccurrence(rule, addDaysKey(startKey(), -1)), now)}. В свой день задача сама появится в «Сегодня».`
          : '';
      };
      syncRepeat();

      form.addEventListener('change', (e) => {
        if (e.target.name === 'impact') $('#impact-hint').textContent = IMPACTS[e.target.value].hint;
        if (e.target.id === 'edit-repeat') syncRepeat(true);
        if (e.target.id === 'edit-unit' || e.target.id === 'edit-start') syncRepeat(e.target.id === 'edit-unit');
      });
      $('#edit-every').addEventListener('input', () => syncRepeat());
      form.querySelectorAll('.wd').forEach((b) =>
        b.addEventListener('click', () => {
          const d = Number(b.dataset.wd);
          const next = weekdays.includes(d) ? weekdays.filter((x) => x !== d) : [...weekdays, d];
          if (!next.length) return; // хотя бы один день
          weekdays = next;
          // «По будням» с другими днями — это уже «Каждую неделю» по выбранным дням
          if ($('#edit-repeat').value === 'weekdays') $('#edit-repeat').value = 'weekly';
          syncRepeat();
        }),
      );
      form.querySelectorAll('[data-remind]').forEach((b) =>
        b.addEventListener('click', () => {
          remind.value = b.dataset.remind;
        }),
      );
      $('#clear-remind-time').addEventListener('click', () => {
        $('#edit-remind-time').value = '';
      });
      $('[data-act="focus"]').addEventListener('click', () => {
        close();
        ui.focusTaskId = id;
        location.hash = '#focus';
      });
      $('[data-act="skip"]')?.addEventListener('click', () => {
        close();
        const date = store.skipOccurrence(id);
        if (date) toast(`Этот раз пропущен. Следующий — ${formatDayKey(date)}.`);
      });
      $('[data-act="cut"]').addEventListener('click', () => {
        close();
        cutWithUndo(id);
      });
      $('[data-act="delegate"]').addEventListener('click', () => {
        const row = $('#delegate-row');
        row.hidden = false;
        row.querySelector('input').focus();
      });
      $('[data-act="delegate-confirm"]').addEventListener('click', () => {
        const who = $('#edit-delegate').value.trim();
        if (!who) return $('#edit-delegate').focus();
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
        if (!title) return $('#edit-title').focus();
        const impact = data.get('impact');
        const rule = readRule();
        const dueDate = rule ? nextOccurrence(rule, addDaysKey(startKey(), -1)) : null;
        let horizon = rule ? horizonForDate(dueDate, today) : data.get('horizon');
        const current = store.findTask(id);
        const needsCheck = horizon === 'today' && (current.horizon !== 'today' || current.impact !== impact);
        close();
        if (needsCheck) {
          const decision = await guardPlacement({ impact, horizon, id });
          if (!decision) return;
          if (decision === 'cut') return cutWithUndo(id);
          horizon = decision;
        }
        const remindValue = rule ? '' : String(data.get('remindAt') || '');
        const remindTime = rule ? $('#edit-remind-time').value || null : null;
        store.updateTask(id, {
          title,
          note: String(data.get('note') || '').trim(),
          impact,
          horizon,
          repeat: rule,
          dueDate,
          remindTime,
          remindAt: remindValue ? new Date(remindValue).toISOString() : null,
        });
        const wantsReminder = remindValue || remindTime;
        if (wantsReminder && !store.getState().settings.notify.enabled) {
          toast('Напоминание сохранено. Включи уведомления в настройках, чтобы оно пришло.', {
            action: { label: 'Настройки', run: () => (location.hash = '#settings') },
            timeout: 7000,
          });
        } else if (rule && !task.repeat) {
          toast(`Повтор: ${describeRule(rule)}. Первый раз — ${formatDayKey(dueDate)}.`);
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

