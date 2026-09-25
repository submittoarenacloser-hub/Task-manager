// Состояние интерфейса, которое не нужно сохранять: открытая вкладка, черновик и т. п.

export const ui = {
  horizon: 'today',
  draft: { title: '', impact: null, horizon: null },
  showDone: {},
  focusTaskId: null,
  focusMinutes: null,
  triage: null, // { queue, index, start, kept, cut, delegated, delegating }
  triageResult: null,
  installPrompt: null,
};

let refreshFn = () => {};
export const setRefresh = (fn) => {
  refreshFn = fn;
};
/** Перерисовать текущий экран после изменения ui. */
export const refresh = () => refreshFn();
