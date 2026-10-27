// Service worker: answers every GET network-first and falls back to the cache offline, so online users always get the deployed files and current API data.
const SHELL_CACHE = 'webula-shell-v3';
// state.js deletes this cache when the token changes: entries are keyed by URL, not by token.
const API_CACHE = 'webula-api';
const API_MAX_ENTRIES = 100;

// Must list exactly the shipped files; one 404 fails the install.
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/style.css',
  '/icons.json',
  '/manifest.json',
  '/icons/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png',
  '/js/app.js',
  '/js/api.js',
  '/js/router.js',
  '/js/state.js',
  '/js/icons.js',
  '/js/actions.js',
  '/js/refresh.js',
  '/js/offline.js',
  '/js/components/loading.js',
  '/js/components/nav.js',
  '/js/components/pagination.js',
  '/js/components/system-map.js',
  '/js/components/countdown.js',
  '/js/components/server-reset.js',
  '/js/views/login.js',
  '/js/views/fleet.js',
  '/js/views/ship-detail.js',
  '/js/views/ship-actions.js',
  '/js/views/contracts.js',
  '/js/views/system.js',
  '/js/views/waypoint-detail.js',
  '/js/views/systems.js',
  '/js/views/factions.js',
  '/js/views/agents.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names
        .filter((name) => name !== SHELL_CACHE && name !== API_CACHE)
        .map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

// Writes pass through untouched; performAction refuses them offline.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const isApi = new URL(event.request.url).hostname === 'api.spacetraders.io';
  event.respondWith(networkFirst(event.request, isApi ? API_CACHE : SHELL_CACHE));
});

async function networkFirst(request, cacheName) {
  let response;
  try {
    response = await fetch(request);
  } catch {
    return (await caches.match(request, { cacheName })) ?? offlineResponse();
  }
  if (response.ok) store(request, response.clone(), cacheName);
  return response;
}

async function store(request, response, cacheName) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  if (cacheName !== API_CACHE) return;
  // keys() lists the oldest entry first, because put() re-appends a replaced entry.
  const keys = await cache.keys();
  for (const key of keys.slice(0, -API_MAX_ENTRIES)) cache.delete(key);
  const timestamp = Date.now();
  for (const client of await self.clients.matchAll()) client.postMessage({ type: 'api-updated', timestamp });
}

// Same shape as an API error body, so api.js reports "You are offline".
function offlineResponse() {
  return new Response(JSON.stringify({ error: { message: 'You are offline' } }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}
