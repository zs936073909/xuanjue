// service-worker.js — 玄决 PWA 离线缓存与通知支持
const CACHE_VERSION = 'v1.5.0';
const STATIC_CACHE = 'xuanjue-static-' + CACHE_VERSION;
const DATA_CACHE = 'xuanjue-data-' + CACHE_VERSION;

const STATIC_ASSETS = [
  './',
  './css/style.css',
  './icon-192.png',
  './icon-512.png',
  './img/ambient-hero.jpg',
  './index.html',
  './js/ai.js',
  './js/app.js',
  './js/bio-unlock.js',
  './js/classics.js',
  './js/cloud.js',
  './js/cross.js',
  './js/daliuren.js',
  './js/huangli.js',
  './js/iztro.min.js',
  './js/lunar.js',
  './js/shushu.js',
  './js/startup.js',
  './js/store.js',
  './js/vendor-loader.js',
  './js/vendor/iching-shifa.min.js',
  './js/vendor/qimendunjia-standalone.min.js',
  './js/vendor/tarot-kit.min.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== STATIC_CACHE && k !== DATA_CACHE).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 同源 data 文件：优先网络，失败回退缓存（stale-while-revalidate）
  if (url.origin === self.location.origin && url.pathname.startsWith('/data/')) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request).then((res) => {
          if (res && res.status === 200) cache.put(request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // 静态资源：缓存优先
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (!res || res.status !== 200 || request.method !== 'GET') return res;
          const isStatic = STATIC_ASSETS.some((p) => url.pathname.endsWith(p.replace('./', '/')) || url.pathname === p.replace('./', '/'));
          if (isStatic) {
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, res.clone()));
          }
          return res;
        }).catch(() => cached);
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      if (clients && clients.length) {
        clients[0].focus();
      } else {
        self.clients.openWindow('./');
      }
    })
  );
});
