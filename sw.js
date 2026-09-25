// Service worker: работа без сети и открытие нужного экрана по клику на уведомление.
// При изменении файлов приложения увеличь версию кеша.

const CACHE = 'vector-v3';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/fonts.css',
  'css/styles.css',
  'fonts/onest-cyrillic.woff2',
  'fonts/onest-latin.woff2',
  'fonts/unbounded-cyrillic.woff2',
  'fonts/unbounded-latin.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/badge-96.png',
  'js/app.js',
  'js/dates.js',
  'js/focus.js',
  'js/model.js',
  'js/native.js',
  'js/notifier.js',
  'js/rules.js',
  'js/schedule.js',
  'js/stats.js',
  'js/store.js',
  'js/ui/dom.js',
  'js/ui/focus-view.js',
  'js/ui/settings-view.js',
  'js/ui/sheets.js',
  'js/ui/stats-view.js',
  'js/ui/tasks-view.js',
  'js/ui/triage-view.js',
  'js/ui/ui-state.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // Свои файлы: сразу из кеша, в фоне обновляем (свежая версия — при следующем запуске).
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      const res = await network;
      if (res) return res;
      if (request.mode === 'navigate') return cache.match('index.html');
      return Response.error();
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  const hash = event.notification.data?.url || '#tasks';
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = windows.find((c) => c.url.startsWith(self.registration.scope));
      if (client) {
        await client.focus();
        client.postMessage({ type: 'navigate', hash });
        return;
      }
      await self.clients.openWindow(new URL(hash, self.registration.scope).href);
    })(),
  );
});
