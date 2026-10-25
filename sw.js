importScripts('i18n.js', 'core.js');

const VERSION = 15;
const SHELL_CACHE = 'bangumi-shell-v' + VERSION;
const RUNTIME_CACHE = 'bangumi-runtime-v' + VERSION;
const SHELL = [
  './', './index.html', './styles.css', './skins.css', './app.js', './motion.js', './map.js', './share.js', './core.js', './i18n.js', './import.js', './wrap.js', './fun.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/badge-96.png'
];

self.addEventListener('install', e => {
  // cache: 'reload' — берём файлы прямо с сервера, а не из старого кэша браузера
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Оболочка приложения: сразу из кэша, параллельно обновляем
  if (url.origin === location.origin) {
    e.respondWith(
      caches.open(SHELL_CACHE).then(async cache => {
        const key = req.mode === 'navigate' ? './index.html' : req;
        const cached = await cache.match(key, { ignoreSearch: true });
        // no-cache: всегда спрашиваем сервер, не изменился ли файл (дёшево, если не изменился)
        const network = fetch(req, { cache: 'no-cache' }).then(res => {
          if (res && res.ok) cache.put(key, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Шрифты и обложки AniList: кэш, чтобы работало без интернета
  const cacheable = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) || /anilist\.co$/.test(url.hostname);
  if (cacheable) {
    e.respondWith(
      caches.open(RUNTIME_CACHE).then(async cache => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        } catch (err) {
          return cached || Response.error();
        }
      })
    );
  }
});

self.addEventListener('periodicsync', e => {
  if (e.tag === 'episodes') e.waitUntil(runBackgroundCheck(self.registration));
});

self.addEventListener('message', e => {
  if (e.data === 'version' && e.ports && e.ports[0]) e.ports[0].postMessage(VERSION);
  if (e.data === 'check') e.waitUntil(runBackgroundCheck(self.registration));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) { c.navigate(target).catch(() => {}); return c.focus(); }
      }
      return self.clients.openWindow(target);
    })
  );
});
