// Мелкие помощники интерфейса: экранирование, иконки, всплывашки, нижний лист.

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const svg = (paths, size = 20) =>
  `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const icon = {
  list: (s) => svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01" stroke-width="2.6"/>', s),
  focus: (s) => svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22"/>', s),
  cut: (s) => svg('<circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M8.2 7.6 20 18M8.2 16.4 20 6"/>', s),
  chart: (s) => svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', s),
  gear: (s) => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', s),
  check: (s) => svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', s),
  play: (s) => svg('<path d="M8 5.5v13l10-6.5z" fill="currentColor"/>', s),
  pause: (s) => svg('<path d="M8 5v14M16 5v14" stroke-width="3"/>', s),
  bell: (s) => svg('<path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16z"/><path d="M10 21h4"/>', s),
  close: (s) => svg('<path d="M6 6l12 12M18 6 6 18"/>', s),
  up: (s) => svg('<path d="M12 19V5M6 11l6-6 6 6"/>', s),
  arrow: (s) => svg('<path d="M4 12h15M13 6l6 6-6 6"/>', s),
  user: (s) => svg('<circle cx="12" cy="8" r="3.6"/><path d="M5 20c1.2-3.6 4-5.4 7-5.4s5.8 1.8 7 5.4"/>', s),
  repeat: (s) => svg('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>', s),
  warn: (s) => svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4.5M12 17.4v.1" stroke-width="2.2"/>', s),
};

// ——— всплывающие сообщения ———

export function toast(message, { action, timeout = 4500, tone = '' } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="toast-text">${message}</span>`;
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      action.run();
      el.remove();
    });
    el.append(btn);
  }
  host.append(el);
  setTimeout(() => el.remove(), timeout);
}

// ——— нижний лист (модальное окно) ———

/**
 * Открыть лист. html — содержимое, bind(dialog, close) — навесить обработчики.
 */
export function openSheet(html, bind) {
  const dialog = document.getElementById('sheet');
  dialog.innerHTML = html;
  const close = () => {
    if (dialog.open) dialog.close();
  };
  dialog.onclick = (e) => {
    // клик по затемнению вокруг листа
    if (e.target === dialog) close();
    if (e.target.closest('[data-close]')) close();
  };
  bind?.(dialog, close);
  if (!dialog.open) dialog.showModal();
  const first = dialog.querySelector('[autofocus]');
  first?.focus();
  return close;
}
