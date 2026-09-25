// Точка входа: маршруты, отрисовка, обработка событий, уведомления, офлайн-режим.

import * as store from './store.js';
import { startNotifier } from './notifier.js';
import { isNative, initNative, scheduleSync, minimize } from './native.js';
import { position, formatClock } from './focus.js';
import { esc, icon, toast } from './ui/dom.js';
import { ui, setRefresh } from './ui/ui-state.js';
import * as tasksView from './ui/tasks-view.js';
import * as focusView from './ui/focus-view.js';
import * as triageView from './ui/triage-view.js';
import * as statsView from './ui/stats-view.js';
import * as settingsView from './ui/settings-view.js';

const ROUTES = {
  tasks: { view: tasksView, label: 'Задачи', icon: icon.list, title: 'Задачи' },
  focus: { view: focusView, label: 'Фокус', icon: icon.focus, title: 'Фокус-сессия' },
  triage: { view: triageView, label: 'Разбор', icon: icon.cut, title: 'Разбор 80/20' },
  stats: { view: statsView, label: 'Итоги', icon: icon.chart, title: 'Итоги' },
  settings: { view: settingsView, label: 'Настройки', icon: icon.gear, title: 'Настройки', hidden: true },
};

const viewEl = document.getElementById('view');
const navEl = document.getElementById('nav');
const focusPill = document.getElementById('focus-pill');

const currentRoute = () => {
  const key = location.hash.replace('#', '');
  return ROUTES[key] ? key : 'tasks';
};

function renderNav(route) {
  navEl.innerHTML = Object.entries(ROUTES)
    .filter(([, r]) => !r.hidden)
    .map(
      ([key, r]) =>
        `<a href="#${key}" class="nav-link ${key === route ? 'is-active' : ''}" ${key === route ? 'aria-current="page"' : ''}>${r.icon(22)}<span>${r.label}</span></a>`,
    )
    .join('');
  document.querySelector('.settings-link')?.classList.toggle('is-active', route === 'settings');
}

/** Перерисовка с сохранением фокуса и курсора в полях ввода. */
function render() {
  const route = currentRoute();
  const state = store.getState();
  const active = document.activeElement;
  const keep = active?.id && viewEl.contains(active) ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;

  document.body.dataset.route = route;
  document.title = route === 'tasks' ? 'Вектор' : `${ROUTES[route].title} · Вектор`;
  renderNav(state.onboarded ? route : null);
  navEl.hidden = !state.onboarded;
  viewEl.innerHTML = ROUTES[route].view.render(state);
  updateFocusPill();

  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) {
      el.focus({ preventScroll: true });
      try {
        if (keep.start != null) el.setSelectionRange(keep.start, keep.end);
      } catch {
        // у некоторых полей нет выделения
      }
    }
  }
}

function updateFocusPill() {
  const f = store.getState().focus;
  const show = f && currentRoute() !== 'focus';
  focusPill.hidden = !show;
  if (show) {
    const p = position(f);
    const onBreak = !p.finished && p.segment.kind === 'break';
    focusPill.classList.toggle('is-break', onBreak);
    focusPill.innerHTML = `<span class="pill-dot ${f.running ? 'is-running' : ''}"></span>${
      p.finished ? 'время вышло' : `${onBreak ? 'перерыв ' : ''}${formatClock(p.segmentRemainingMs)}`
    }`;
  }
}

setRefresh(render);
store.subscribe((state, { silent } = {}) => {
  if (!silent) render();
});
window.addEventListener('hashchange', () => {
  // переход на другой экран (в том числе кнопкой «Назад») закрывает открытый лист
  const sheet = document.getElementById('sheet');
  if (sheet.open) sheet.close();
  render();
  viewEl.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
});

// ——— делегирование событий на текущий экран ———

viewEl.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !viewEl.contains(el)) return;
  const handler = ROUTES[currentRoute()].view.actions?.[el.dataset.action];
  if (handler) handler(el, e);
});

viewEl.addEventListener('submit', (e) => {
  const handler = ROUTES[currentRoute()].view.submit?.[e.target.id];
  if (!handler) return;
  e.preventDefault();
  handler(e.target, e);
});

viewEl.addEventListener('input', (e) => ROUTES[currentRoute()].view.onInput?.(e));
viewEl.addEventListener('change', (e) => ROUTES[currentRoute()].view.onChange?.(e));
viewEl.addEventListener('toggle', (e) => ROUTES[currentRoute()].view.onToggle?.(e), true);

// ——— таймер фокуса: раз в секунду, без полной перерисовки ———

setInterval(() => {
  const state = store.getState();
  if (!state.focus) return;
  if (currentRoute() === 'focus') focusView.tick(state);
  updateFocusPill();
}, 1000);

// Смена дня: перерисовать, чтобы «хвосты» и счётчики обновились.
let lastDay = new Date().toDateString();
setInterval(() => {
  const day = new Date().toDateString();
  if (day !== lastDay) {
    lastDay = day;
    store.refreshDue(); // задачи с датой переезжают ближе к «Сегодня»
    render();
  }
}, 60_000);

// ——— уведомления ———

startNotifier({
  getState: store.getState,
  onInApp: (n) =>
    toast(`<b>${esc(n.title)}</b><br>${esc(n.body)}`, {
      timeout: 9000,
      action: n.url && n.url !== location.hash ? { label: 'Открыть', run: () => (location.hash = n.url) } : undefined,
    }),
});

// ——— офлайн и установка ———

// В Android-версии файлы и так лежат в приложении, service worker там не нужен.
if (!isNative && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // клик по уведомлению: service worker просит открыть нужный экран
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'navigate' && e.data.hash) location.hash = e.data.hash;
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  ui.installPrompt = e;
  if (currentRoute() === 'settings') render();
});

// ——— Android-версия ———

if (isNative) {
  store.subscribe(() => scheduleSync());
  initNative({
    getState: store.getState,
    onOpenUrl: (url) => (location.hash = url),
    onResume: () => {
      store.refreshDue();
      render();
    },
    onBack: () => {
      const sheet = document.getElementById('sheet');
      if (sheet.open) sheet.close();
      else if (currentRoute() !== 'tasks') location.hash = '#tasks';
      else minimize();
    },
  });
}

render();
