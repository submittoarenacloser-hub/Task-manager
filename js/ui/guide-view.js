// Короткий гид для нового пользователя: 8 шагов с маленькими примерами интерфейса.
// Открывается сам после знакомства, потом — из настроек («Как пользоваться Вектором»).

import { icon } from './dom.js';
import * as store from '../store.js';
import { ui, refresh } from './ui-state.js';

const dot = (k) => `<span class="dot dot-${k}" aria-hidden="true"></span>`;

const STEPS = [
  {
    title: 'Начни с цели',
    text: 'Вектор оценивает каждую задачу по одной главной цели. Сформулируй её через результат, который можно посчитать. Цель всегда видна вверху экрана, нажми на неё, чтобы изменить.',
    demo: `<div class="goal"><span class="goal-label">Цель</span><span class="goal-title">10 новых клиентов в месяц</span></div>`,
  },
  {
    title: 'Прямая, косвенная или шум',
    text: 'При добавлении задачи ответь на вопрос: «Если сделать только это, ты приблизишься к цели?» Прямые задачи всегда стоят первыми. Шум лучше отсечь сразу.',
    demo: `<div class="impact-pick">
      <span class="pick pick-direct" aria-checked="true">${dot('direct')}Прямая</span>
      <span class="pick">${dot('indirect')}Косвенная</span>
      <span class="pick">${dot('noise')}Шум</span>
    </div>
    <p class="guide-note">Прямая: приносит деньги или двигает цель. Косвенная: помогает, но не сразу. Шум: не двигает совсем.</p>`,
  },
  {
    title: 'В «Сегодня» — только главное',
    text: 'На день не больше 5 задач, из них не больше 2 косвенных; лимиты меняются в настройках. Шум в «Сегодня» не ставится. Если что-то не сделано вчера, утром Вектор попросит решить: оставить, перенести или отсечь.',
    demo: `<div class="horizon-tabs guide-tabs">
      <span class="htab is-active"><span>Сегодня</span><span class="htab-n">3/5</span></span>
      <span class="htab"><span>Неделя</span><span class="htab-n">4</span></span>
      <span class="htab"><span>Месяц</span><span class="htab-n">2</span></span>
      <span class="htab"><span>Потом</span><span class="htab-n">6</span></span>
    </div>`,
  },
  {
    title: 'Радар ловушки',
    text: 'Процент вверху показывает долю прямых задач среди сделанного за день. Если ты закрываешь косвенные одну за другой, а прямая ждёт, Вектор скажет об этом прямо.',
    demo: `<div class="radar radar-trap guide-radar">
      <div class="radar-head">${icon.warn(18)}<b>Похоже на ловушку занятости</b></div>
      <ul><li>3 косвенные задачи подряд, а прямая «Отправить КП» ждёт.</li></ul>
    </div>`,
  },
  {
    title: 'Фокус по Помодоро',
    text: 'На экране «Фокус» выбери длину круга, перерыва и общее время. Вектор сам разложит сессию, например 50 · 10 · 50 · 10 · 50, и напомнит, когда отдыхать и когда возвращаться.',
    demo: `<div class="pstrip imp-direct">
      <span class="pseg pseg-focus" style="flex-grow:50"><i style="width:100%"></i></span>
      <span class="pseg pseg-break" style="flex-grow:10"><i style="width:100%"></i></span>
      <span class="pseg pseg-focus" style="flex-grow:50"><i style="width:40%"></i></span>
      <span class="pseg pseg-break" style="flex-grow:10"></span>
      <span class="pseg pseg-focus" style="flex-grow:50"></span>
    </div>
    <p class="guide-note">Круг 2 из 3 · закончишь в 13:50</p>`,
  },
  {
    title: 'Разбор 80/20 раз в неделю',
    text: 'Около 20% задач дают 80% результата. В разделе «Разбор» пройди по всем задачам по одной и оставь только те, что двигают цель. Остальное отсеки или делегируй.',
    demo: `<div class="pareto"><div class="pareto-fig"><span class="pareto-num">24</span><span class="pareto-cap">открыто задач</span></div>${icon.arrow(22)}<div class="pareto-fig"><span class="pareto-num">≈5</span><span class="pareto-cap">должно остаться</span></div></div>`,
  },
  {
    title: 'Повторы, длительность, выходные',
    text: 'Нажми на задачу, чтобы задать повтор («по будням», «раз в 3 месяца»), сколько дней она займёт и напоминание. В настройках отметь свои выходные: в эти дни Вектор не пишет о работе и не считает дни.',
    demo: `<div class="guide-meta">
      <span class="meta">${icon.repeat(14)} по будням · ${icon.bell(14)} 10:00</span>
      <span class="meta">${icon.clock(14)} день 2 из 3</span>
      <span class="weekday-pick">${['пн', 'вт', 'ср', 'чт', 'пт'].map((d) => `<span class="wd">${d}</span>`).join('')}<span class="wd wd-off" aria-pressed="true">сб</span><span class="wd wd-off" aria-pressed="true">вс</span></span>
    </div>`,
  },
  {
    title: 'Дом и дела отдельно',
    text: 'Фильтр для воды, масло в машине, налоги — в разделе «Дом». Он не смешивается с рабочими задачами и напоминает в день срока, даже в выходные. Чтобы напоминания приходили, включи уведомления в настройках.',
    demo: `<span class="life-line">${icon.home(18)}<span>Заменить фильтр для воды · раз в 3 месяца</span></span>`,
  },
];

export function render() {
  const i = Math.min(ui.guideStep, STEPS.length - 1);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  return `<section class="guide" aria-live="polite">
    <div class="guide-top">
      <span class="eyebrow">Как пользоваться · шаг ${i + 1} из ${STEPS.length}</span>
      <button type="button" class="btn quiet small" data-action="finish">Пропустить</button>
    </div>
    <div class="guide-card">
      <div class="guide-demo">${step.demo}</div>
      <h1>${step.title}</h1>
      <p class="lead">${step.text}</p>
    </div>
    <div class="guide-dots" aria-hidden="true">${STEPS.map((_, n) => `<span class="${n === i ? 'is-on' : ''}"></span>`).join('')}</div>
    <div class="guide-actions">
      ${i > 0 ? '<button type="button" class="btn big" data-action="back">Назад</button>' : ''}
      ${
        last
          ? `<button type="button" class="btn big" data-action="notify">${icon.bell(18)} Уведомления</button>
             <button type="button" class="btn primary big" data-action="finish">Начать работу</button>`
          : `<button type="button" class="btn primary big" data-action="next">Далее ${icon.arrow(18)}</button>`
      }
    </div>
  </section>`;
}

const leave = (hash) => {
  ui.guideStep = 0;
  store.markGuideSeen();
  location.hash = hash;
};

export const actions = {
  next: () => {
    ui.guideStep = Math.min(ui.guideStep + 1, STEPS.length - 1);
    refresh();
  },
  back: () => {
    ui.guideStep = Math.max(0, ui.guideStep - 1);
    refresh();
  },
  finish: () => leave('#tasks'),
  notify: () => leave('#settings'),
};
