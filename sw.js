/* Service worker: оболочка приложения работает без сети.
   Данные Firestore сюда не попадают: их кэширует сам Firebase (enablePersistence).
   Выложили новую версию index.html — поменяйте номер в CACHE. */
const CACHE = 'svezhest-v3';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const STATIC_HOSTS = ['www.gstatic.com', 'fonts.gstatic.com', 'fonts.googleapis.com'];

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (!same && !STATIC_HOSTS.includes(url.hostname)) return; // Firestore, Auth и пр. идут напрямую

  // Страница: сначала сеть (чтобы обновления приходили), без сети — из кэша
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('index.html', copy));
          return res;
        })
        .catch(() => caches.match('index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Остальное: из кэша сразу, в фоне обновляем
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req)
        .then(res => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});

/* ---------- Push-уведомления (Firebase Cloud Messaging) ---------- */
self.addEventListener('push', e => {
  let d = {};
  try {
    const j = e.data && e.data.json();
    d = (j && (j.data || j.notification)) || j || {};
  } catch (_) {}
  const title = d.title || 'Трекер свежести';
  e.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: 'expiry',
      renotify: true
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return self.clients.openWindow('./');
    })
  );
});
