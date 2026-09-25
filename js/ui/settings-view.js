// Настройки: цель, правила фокуса, уведомления, данные.

import { esc, icon, toast, openSheet } from './dom.js';
import { WEEKDAYS_FULL } from '../dates.js';
import { upcoming } from '../schedule.js';
import { permission, requestPermission, show } from '../notifier.js';
import { isNative, exactAlarmState, openExactAlarmSettings, shareBackup } from '../native.js';
import * as store from '../store.js';
import { ui, refresh } from './ui-state.js';

const PERMISSION_TEXT = isNative
  ? {
      granted: 'Разрешены. Приходят, даже когда приложение закрыто.',
      default: 'Android спросит разрешение, когда включишь.',
      denied: 'Запрещены в настройках Android. Разреши уведомления для Вектора: Настройки → Приложения → Вектор → Уведомления.',
      unsupported: 'Уведомления недоступны на этом устройстве.',
    }
  : {
      granted: 'Разрешены. Уведомления приходят системно.',
      default: 'Браузер ещё не спрашивал разрешение.',
      denied: 'Запрещены в браузере. Разреши их в настройках сайта, иначе напоминания будут только внутри приложения.',
      unsupported: 'Этот браузер не показывает системные уведомления. На iPhone сначала добавь приложение на экран «Домой».',
    };

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

function row(key, label, hint, cfg) {
  return `<div class="set-row">
    <label class="switch">
      <input type="checkbox" id="n-${key}" data-notify="${key}" ${cfg.on ? 'checked' : ''}>
      <span class="switch-ui" aria-hidden="true"></span>
      <span class="switch-text"><b>${label}</b><small>${hint}</small></span>
    </label>
    <input type="time" id="n-${key}-time" data-notify-time="${key}" value="${cfg.time}" aria-label="Время: ${label}">
  </div>`;
}

export function render(state) {
  const n = state.settings.notify;
  const perm = permission();
  const next = upcoming(state, new Date(), 4);
  const { limits } = state.settings;

  return `<section class="settings">
    <p class="eyebrow">Настройки</p>
    <h1>Как работает Вектор</h1>

    <section class="panel">
      <h2>Главная цель</h2>
      <label class="field"><span class="field-label">Цель</span>
        <input id="s-goal" data-goal="title" value="${esc(state.goal.title)}" placeholder="Например: 10 новых клиентов в месяц" autocomplete="off"></label>
      <label class="field"><span class="field-label">Чем меряю результат</span>
        <input id="s-metric" data-goal="metric" value="${esc(state.goal.metric)}" placeholder="деньги, клиенты, продажи" autocomplete="off"></label>
    </section>

    <section class="panel">
      <h2>Правила фокуса</h2>
      <div class="grid-2">
        <label class="field"><span class="field-label">Задач на сегодня, максимум</span>
          <input type="number" id="s-limit" data-limit="today" min="1" max="15" value="${limits.today}"></label>
        <label class="field"><span class="field-label">Из них косвенных</span>
          <input type="number" id="s-limit-ind" data-limit="todayIndirect" min="0" max="10" value="${limits.todayIndirect}"></label>
      </div>
      <label class="field"><span class="field-label">Длина фокус-сессии по умолчанию</span>
        <select id="s-focus" data-focus-minutes>
          ${[15, 25, 45, 50, 90].map((m) => `<option value="${m}" ${m === state.settings.focusMinutes ? 'selected' : ''}>${m} минут</option>`).join('')}
        </select></label>
      <p class="field-hint">Шум в «Сегодня» не ставится совсем: приложение предложит отсечь его или отложить.</p>
    </section>

    <section class="panel">
      <h2>Уведомления</h2>
      <div class="set-row master">
        <label class="switch">
          <input type="checkbox" id="n-enabled" data-action="toggle-notify" ${n.enabled ? 'checked' : ''}>
          <span class="switch-ui" aria-hidden="true"></span>
          <span class="switch-text"><b>Присылать уведомления</b><small>${PERMISSION_TEXT[perm]}</small></span>
        </label>
      </div>
      <fieldset class="notify-list" ${n.enabled ? '' : 'disabled'}>
        ${row('morning', 'План на день', 'утром: с какой прямой задачи начать', n.morning)}
        ${row('midday', 'Проверка курса', 'днём: ты сейчас на прямой задаче?', n.midday)}
        ${row('evening', 'Итог дня', 'вечером: доля прямых и хвосты', n.evening)}
        <div class="set-row">
          <label class="switch">
            <input type="checkbox" id="n-weekly" data-notify="weekly" ${n.weekly.on ? 'checked' : ''}>
            <span class="switch-ui" aria-hidden="true"></span>
            <span class="switch-text"><b>Разбор недели 80/20</b><small>раз в неделю: отсечь лишнее</small></span>
          </label>
          <span class="row gap-s">
            <select id="n-weekly-day" data-weekly-day aria-label="День разбора">
              ${[1, 2, 3, 4, 5, 6, 0].map((d) => `<option value="${d}" ${Number(n.weekly.day) === d ? 'selected' : ''}>${WEEKDAYS_FULL[d]}</option>`).join('')}
            </select>
            <input type="time" id="n-weekly-time" data-notify-time="weekly" value="${n.weekly.time}" aria-label="Время разбора">
          </span>
        </div>
        <div class="set-row">
          <label class="switch">
            <input type="checkbox" id="n-trap" data-notify-flag="trap" ${n.trap ? 'checked' : ''}>
            <span class="switch-ui" aria-hidden="true"></span>
            <span class="switch-text"><b>Сигнал ловушки</b><small>три косвенные задачи подряд, пока прямая ждёт</small></span>
          </label>
        </div>
        <div class="set-row">
          <label class="switch">
            <input type="checkbox" id="n-reminders" data-notify-flag="reminders" ${n.reminders ? 'checked' : ''}>
            <span class="switch-ui" aria-hidden="true"></span>
            <span class="switch-text"><b>Напоминания по задачам</b><small>время ставится в карточке задачи</small></span>
          </label>
        </div>
      </fieldset>
      <div class="row gap wrap">
        <button type="button" class="btn small" data-action="test-notify" ${n.enabled ? '' : 'disabled'}>${icon.bell(16)} Проверить уведомление</button>
      </div>
      ${
        next.length
          ? `<div class="upcoming"><h3>Ближайшие</h3><ul>${next
              .map((x) => `<li><span class="when">${x.when}</span><span>${esc(x.title)}</span></li>`)
              .join('')}</ul></div>`
          : ''
      }
      ${
        isNative && n.enabled && perm === 'granted' && exactAlarmState() !== 'granted'
          ? `<div class="exact-note">
              <p>Android может задерживать уведомления на несколько минут. Разреши точное время, чтобы они приходили минута в минуту.</p>
              <button type="button" class="btn small" data-action="exact-alarms">Разрешить точное время</button>
            </div>`
          : ''
      }
      <p class="field-hint">${
        isNative
          ? 'Расписание хранится в Android: уведомления придут, даже если приложение закрыто или телефон перезагружен.'
          : 'Уведомления приходят, пока приложение открыто или свёрнуто. Установи его на главный экран и не закрывай из списка запущенных, чтобы напоминания были надёжнее.'
      }</p>
    </section>

    <section class="panel">
      <h2>Приложение</h2>
      ${
        isNative
          ? '<p class="muted">Приложение для Android.</p>'
          : isStandalone()
          ? '<p class="muted">Установлено на устройство.</p>'
          : ui.installPrompt
            ? '<button type="button" class="btn" data-action="install">Установить на устройство</button>'
            : isIos()
              ? '<p class="muted">Чтобы установить на iPhone: кнопка «Поделиться» в Safari → «На экран „Домой“».</p>'
              : '<p class="muted">Установи через меню браузера: «Установить приложение» или «Добавить на главный экран».</p>'
      }
    </section>

    <section class="panel">
      <h2>Данные</h2>
      <p class="muted">Задачи хранятся только на этом устройстве. Сохраняй копию, чтобы перенести их на другое.</p>
      <div class="row gap wrap">
        <button type="button" class="btn small" data-action="export">${isNative ? 'Сохранить копию' : 'Скачать копию'}</button>
        <label class="btn small file-btn">Загрузить из файла<input type="file" id="s-import" accept="application/json,.json" data-import></label>
        <button type="button" class="btn small quiet danger" data-action="reset">Стереть всё</button>
      </div>
    </section>
  </section>`;
}

export const actions = {
  'toggle-notify': async (el) => {
    const on = el.checked;
    if (on && permission() === 'default') await requestPermission();
    store.updateSettings((s) => {
      s.notify.enabled = on;
      return s;
    });
    if (on && permission() !== 'granted') {
      toast(
        isNative
          ? 'Уведомления запрещены в настройках Android. Разреши их для Вектора, и напоминания начнут приходить.'
          : 'Системные уведомления недоступны. Напоминания будут появляться внутри приложения.',
        { tone: 'warn', timeout: 7000 },
      );
    }
  },
  'exact-alarms': async () => {
    await openExactAlarmSettings();
    refresh();
  },
  'test-notify': async () => {
    const via = await show({
      key: `test:${Date.now()}`,
      title: 'Вектор на связи',
      body: 'Так будут выглядеть напоминания о главном.',
      url: '#settings',
    });
    if (via === 'inapp') toast('<b>Вектор на связи.</b> Системные уведомления не разрешены, поэтому напоминание показано здесь.');
  },
  install: async () => {
    const prompt = ui.installPrompt;
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice.catch(() => null);
    ui.installPrompt = null;
    refresh();
  },
  export: async () => {
    const fileName = `vector-${new Date().toISOString().slice(0, 10)}.json`;
    if (isNative) {
      try {
        await shareBackup(fileName, store.exportData());
      } catch (err) {
        // закрытие меню «Поделиться» без выбора — не ошибка
        if (!/cancel/i.test(String(err?.message))) toast(`Не получилось сохранить копию: ${esc(err?.message ?? err)}`, { tone: 'warn' });
      }
      return;
    }
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  reset: () => {
    openSheet(
      `<div class="sheet-body">
        <header class="sheet-head"><p class="eyebrow">Данные</p><h2>Стереть все задачи и настройки?</h2></header>
        <p class="sheet-lead">Отменить это нельзя. Если данные нужны, сначала скачай копию.</p>
        <footer class="sheet-foot">
          <button type="button" class="btn quiet" data-close>Отмена</button>
          <button type="button" class="btn danger-solid" id="confirm-reset">Стереть</button>
        </footer>
      </div>`,
      (dialog, close) => {
        dialog.querySelector('#confirm-reset').addEventListener('click', () => {
          close();
          store.resetAll();
          location.hash = '#tasks';
        });
      },
    );
  },
};

export function onChange(e) {
  const el = e.target;
  // Поля ввода сохраняем без перерисовки, чтобы не сбивать фокус при переходе по Tab.
  const silent = { silent: true };
  if (el.dataset.goal) {
    store.setGoal({ [el.dataset.goal]: el.value.trim() }, silent);
  } else if (el.dataset.limit) {
    const value = Math.max(Number(el.min), Math.min(Number(el.max), Math.round(Number(el.value) || 0)));
    el.value = value;
    store.updateSettings((s) => {
      s.limits[el.dataset.limit] = value;
      return s;
    }, silent);
  } else if (el.dataset.focusMinutes !== undefined) {
    store.updateSettings((s) => {
      s.focusMinutes = Number(el.value);
      return s;
    }, silent);
  } else if (el.dataset.notify) {
    store.updateSettings((s) => {
      s.notify[el.dataset.notify].on = el.checked;
      return s;
    });
  } else if (el.dataset.notifyTime) {
    if (!el.value) return;
    store.updateSettings((s) => {
      s.notify[el.dataset.notifyTime].time = el.value;
      return s;
    }, silent);
  } else if (el.dataset.weeklyDay !== undefined) {
    store.updateSettings((s) => {
      s.notify.weekly.day = Number(el.value);
      return s;
    }, silent);
  } else if (el.dataset.notifyFlag) {
    store.updateSettings((s) => {
      s.notify[el.dataset.notifyFlag] = el.checked;
      return s;
    });
  } else if (el.dataset.import !== undefined && el.files?.[0]) {
    el.files[0]
      .text()
      .then((text) => {
        store.importData(text);
        toast('Данные загружены');
      })
      .catch((err) => toast(`Не получилось загрузить файл: ${esc(err.message)}`, { tone: 'warn' }));
  }
}
