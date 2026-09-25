// Итоги: куда на самом деле ушли последние 7 дней.

import { esc } from './dom.js';
import { IMPACTS, IMPACT_IDS } from '../model.js';
import { dailySeries, weekSummary, focusMinutes, directStreak, trapStatus } from '../stats.js';
import { addDays, startOfDay, weekdayShort, formatDuration, plural, WEEKDAYS_ON } from '../dates.js';

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const dayLabel = (d) => `${weekdayShort(d)}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;

function niceScale(max) {
  const top = Math.max(4, max);
  const step = top <= 4 ? 1 : top <= 8 ? 2 : top <= 20 ? 5 : 10;
  return { max: Math.ceil(top / step) * step, step };
}

function chart(series) {
  const { max, step } = niceScale(Math.max(...series.map((d) => d.total)));
  const ticks = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  const last = series.length - 1;
  return `<figure class="chart">
    <figcaption class="chart-head">
      <span class="chart-title">Сделано по дням</span>
      <span class="legend">${IMPACT_IDS.map((k) => `<span class="key"><span class="dot dot-${k}" aria-hidden="true"></span>${IMPACTS[k].label}</span>`).join('')}</span>
    </figcaption>
    <div class="chart-plot">
      <div class="chart-grid" aria-hidden="true">${ticks
        .map((v) => `<div class="gl" style="bottom:${(v / max) * 100}%"><span>${v}</span></div>`)
        .join('')}</div>
      <div class="chart-cols">${series
        .map((d, i) => {
          const tip = `${dayLabel(d.date)}: ${IMPACT_IDS.map((k) => `${IMPACTS[k].label.toLowerCase()} ${d[k]}`).join(', ')}`;
          return `<div class="ccol" tabindex="0" aria-label="${esc(tip)}">
            <div class="ccol-area">
              ${i === last && d.total ? `<span class="ccol-cap" style="bottom:${(d.total / max) * 100}%">${d.total}</span>` : ''}
              <div class="ccol-stack" style="height:${(d.total / max) * 100}%">
                ${['noise', 'indirect', 'direct'].filter((k) => d[k]).map((k) => `<i class="seg-${k}" style="flex-grow:${d[k]}"></i>`).join('')}
              </div>
            </div>
            <span class="ccol-label ${i === last ? 'is-today' : ''}">${i === last ? 'сегодня' : weekdayShort(d.date)}</span>
            <span class="tip" role="tooltip">${esc(tip)}</span>
          </div>`;
        })
        .join('')}</div>
    </div>
    <details class="table-view">
      <summary>Показать таблицей</summary>
      <div class="table-scroll"><table>
        <thead><tr><th>День</th>${IMPACT_IDS.map((k) => `<th>${IMPACTS[k].label}</th>`).join('')}<th>Всего</th></tr></thead>
        <tbody>${series
          .map((d) => `<tr><td>${dayLabel(d.date)}</td>${IMPACT_IDS.map((k) => `<td>${d[k]}</td>`).join('')}<td>${d.total}</td></tr>`)
          .join('')}</tbody>
      </table></div>
    </details>
  </figure>`;
}

function timeBar(mins) {
  if (!mins.total) return '<p class="muted">Фокус-сессий за неделю не было. Запусти таймер на прямой задаче — время появится здесь.</p>';
  return `<div class="bar tall" role="img" aria-label="Время в фокусе: прямые ${formatDuration(mins.direct)}, косвенные ${formatDuration(mins.indirect)}, шум ${formatDuration(mins.noise)}">
      ${IMPACT_IDS.filter((k) => mins[k]).map((k) => `<i class="seg seg-${k}" style="flex-grow:${mins[k]}"></i>`).join('')}
    </div>
    <div class="legend">${IMPACT_IDS.map((k) => `<span class="key"><span class="dot dot-${k}" aria-hidden="true"></span>${IMPACTS[k].label}: ${formatDuration(mins[k])}</span>`).join('')}</div>`;
}

function insights(state, series, now) {
  const out = [];
  const best = series.reduce((a, b) => (b.direct > a.direct ? b : a), series[0]);
  const tie = series.filter((d) => d.direct === best.direct).length > 1;
  if (best.direct >= 2 && !tie) {
    out.push(`Больше всего прямых задач было ${WEEKDAYS_ON[best.date.getDay()]}: ${best.direct}. Что в тот день было по-другому?`);
  }
  const noise = series.reduce((s, d) => s + d.noise, 0);
  if (noise >= 3) out.push(`За неделю сделано ${noise} ${plural(noise, ['задача', 'задачи', 'задач'])} из категории «шум». Такие лучше отсекать сразу при добавлении.`);
  for (const r of trapStatus(state.tasks, now).reasons) {
    if (r.code !== 'no-direct') out.push(r.message);
  }
  return out;
}

export function render(state) {
  const now = new Date();
  const series = dailySeries(state.tasks, now, 7);
  const week = weekSummary(state.tasks, now);
  const end = addDays(startOfDay(now), 1);
  const mins = focusMinutes(state.sessions, addDays(end, -7), end);
  const streak = directStreak(state.tasks, now);
  const pct = week.share === null ? null : Math.round(week.share * 100);
  const prevPct = week.prevShare === null ? null : Math.round(week.prevShare * 100);
  const delta = pct !== null && prevPct !== null ? pct - prevPct : null;
  const notes = insights(state, series, now);

  return `<section class="stats">
    <p class="eyebrow">Итоги · последние 7 дней</p>
    <h1>Куда ушла неделя</h1>

    <div class="tiles">
      <div class="tile tile-hero">
        <span class="tile-label">Фокус недели</span>
        <span class="tile-value">${pct === null ? '—' : `${pct}%`}</span>
        <span class="tile-sub">${
          delta === null
            ? 'доля прямых среди сделанного'
            : `<span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} п.п.</span> к прошлым 7 дням`
        }</span>
      </div>
      <div class="tile">
        <span class="tile-label">Прямых сделано</span>
        <span class="tile-value">${week.cur.direct}</span>
        <span class="tile-sub">из ${week.cur.total} ${plural(week.cur.total, ['задачи', 'задач', 'задач'])}</span>
      </div>
      <div class="tile">
        <span class="tile-label">Отсечено</span>
        <span class="tile-value">${week.cut}</span>
        <span class="tile-sub">задач убрано за 7 дней</span>
      </div>
      <div class="tile">
        <span class="tile-label">Серия</span>
        <span class="tile-value">${streak}</span>
        <span class="tile-sub">${plural(streak, ['день', 'дня', 'дней'])} подряд с прямой</span>
      </div>
    </div>

    ${chart(series)}

    <section class="panel">
      <h2>Время в фокусе</h2>
      ${timeBar(mins)}
    </section>

    ${
      notes.length
        ? `<section class="panel">
            <h2>Что видно</h2>
            <ul class="insights">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
          </section>`
        : ''
    }
  </section>`;
}

export const actions = {};
