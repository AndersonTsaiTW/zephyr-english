// Zephyr service worker.
//
// The point is a commute: the reader should be able to open today's article
// on a train with no signal. So the shell is cached on install, and today's
// and tomorrow's articles are cached whenever the app is online.
//
// Bump CACHE when the shell changes. The old cache is deleted on activate.

const CACHE = 'zephyr-v1';

const SHELL = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.webmanifest',
  './icons/zephyr.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './content/articles/sample.json',
];

function dayKey(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Tomorrow as well as today, so crossing midnight offline still works.
async function cacheUpcomingArticles() {
  const cache = await caches.open(CACHE);
  let dates = [dayKey(0), dayKey(1)];
  try {
    const res = await fetch('./content/index.json', { cache: 'no-store' });
    if (res.ok) {
      const published = await res.json();
      if (Array.isArray(published)) dates = dates.filter((d) => published.includes(d));
    }
  } catch {
    // Offline during activation is fine; the next online visit will fill in.
  }
  await Promise.all(
    dates.map((date) =>
      cache.add(`./content/articles/${date}.json`).catch(() => {
        // A date with no article yet is expected, not an error.
      })
    )
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await cacheUpcomingArticles();
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isContent = url.pathname.includes('/content/');

  if (isContent) {
    // Content changes daily, so ask the network first and keep a copy for
    // the times there is no network.
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // The shell only changes when we deploy, and the cache name changes with it.
  event.respondWith(
    caches.match(request).then((hit) => hit ?? fetch(request))
  );
});
