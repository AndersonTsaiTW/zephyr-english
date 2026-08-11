// Zephyr service worker.
//
// The point is a commute: the reader should be able to open today's article
// on a train with no signal. So the shell is cached on install, and today's
// and tomorrow's articles are cached whenever the app is online.
//
// The old cache is deleted on activate.

const CACHE = 'zephyr-v2';

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
  // Three reading levels, and a day rarely has all of them, so a miss here is
  // ordinary rather than a failure.
  const paths = dates.flatMap((date) => [
    `./content/articles/${date}.json`,
    `./content/articles/${date}-easy.json`,
    `./content/articles/${date}-hard.json`,
  ]);
  await Promise.all(paths.map((path) => cache.add(path).catch(() => {})));
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

  // The shell is served network first too, and this is deliberate.
  //
  // Cache first is the usual advice, but it assumes filenames change when
  // their contents do. Ours do not: app.js is always app.js. With cache
  // first, the first visit pins a copy of the code and no later deploy ever
  // reaches that reader again, unless someone remembers to bump CACHE by
  // hand. Forgetting once leaves people stuck on a broken version with no
  // way to recover, and no way for us to tell.
  //
  // Going to the network first costs one conditional request per file on a
  // working connection, and the cache still answers when there is none.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit ?? caches.match('./index.html')))
  );
});
