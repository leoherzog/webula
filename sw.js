var SHELL_CACHE = 'webula-shell-v1';
var CDN_CACHE = 'webula-cdn-v1';
var API_CACHE = 'webula-api';

var CURRENT_CACHES = [SHELL_CACHE, CDN_CACHE, API_CACHE];

var API_MAX_ENTRIES = 100;
var API_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

var APP_SHELL = [
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
  '/js/views/login.js',
  '/js/views/dashboard.js',
  '/js/views/fleet.js',
  '/js/views/ship-detail.js',
  '/js/views/ship-actions.js',
  '/js/views/contracts.js',
  '/js/views/system.js',
  '/js/views/waypoint-detail.js',
];

// ─── Install: precache app shell ────────────────────────────────────

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// ─── Activate: clean old caches ─────────────────────────────────────

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names
          .filter(function (name) { return CURRENT_CACHES.indexOf(name) === -1; })
          .map(function (name) { return caches.delete(name); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// ─── Fetch: route by request type ───────────────────────────────────

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);

  // Only handle GET requests for caching strategies
  if (event.request.method !== 'GET') {
    // Non-GET to the SpaceTraders API: network-only
    if (url.hostname === 'api.spacetraders.io') {
      event.respondWith(
        fetch(event.request).catch(function () {
          return new Response(
            JSON.stringify({ error: { message: 'You are offline' } }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        })
      );
    }
    return;
  }

  // Local app shell: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(event.request, SHELL_CACHE));
    return;
  }

  // jsdelivr CDN: cache-first (versioned, immutable)
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(cacheFirst(event.request, CDN_CACHE));
    return;
  }

  // Font Awesome kit: network-first (dynamic script)
  if (url.hostname === 'kit.fontawesome.com' || url.hostname === 'ka-p.fontawesome.com') {
    event.respondWith(networkFirst(event.request, CDN_CACHE));
    return;
  }

  // SpaceTraders API GET: stale-while-revalidate
  if (url.hostname === 'api.spacetraders.io') {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }
});

// ─── Caching strategies ─────────────────────────────────────────────

function cacheFirst(request, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response.ok) cache.put(request, response.clone());
        return response;
      });
    });
  });
}

function networkFirst(request, cacheName) {
  return fetch(request).then(function (response) {
    if (response.ok) {
      var clone = response.clone();
      caches.open(cacheName).then(function (cache) { cache.put(request, clone); });
    }
    return response;
  }).catch(function () {
    return caches.match(request).then(function (cached) {
      return cached || new Response('', { status: 503 });
    });
  });
}

function staleWhileRevalidate(request) {
  return caches.open(API_CACHE).then(function (cache) {
    return cache.match(request).then(function (cached) {
      // Discard cached response if older than max age
      if (cached) {
        var cachedTime = cached.headers.get('sw-cached-at');
        if (cachedTime && (Date.now() - Number(cachedTime)) > API_MAX_AGE_MS) {
          cached = undefined;
        }
      }

      var fetchPromise = fetch(request).then(function (response) {
        if (response.ok && response.status !== 204) {
          // Clone and stamp with cache time before storing
          var headers = new Headers(response.headers);
          headers.set('sw-cached-at', String(Date.now()));
          response.clone().blob().then(function (body) {
            var stamped = new Response(body, {
              status: response.status,
              statusText: response.statusText,
              headers: headers,
            });
            cache.put(request, stamped);
          });
          evictApiCache(cache);
          // Notify clients that fresh data arrived
          var timestamp = Date.now();
          self.clients.matchAll().then(function (clients) {
            clients.forEach(function (client) {
              client.postMessage({ type: 'api-updated', url: request.url, timestamp: timestamp });
            });
          }).catch(function () {});
        }
        return response;
      }).catch(function (err) {
        // Network failed — if we had a cached response, it was already returned
        // If not, propagate the error
        if (!cached) throw err;
      });

      // Return cached immediately if available, otherwise wait for network
      return cached || fetchPromise;
    });
  });
}

// Evict oldest entries when the API cache exceeds max size
function evictApiCache(cache) {
  cache.keys().then(function (keys) {
    if (keys.length <= API_MAX_ENTRIES) return;
    // Gather timestamps, sort oldest first, delete excess
    Promise.all(keys.map(function (key) {
      return cache.match(key).then(function (res) {
        return { key: key, time: Number(res.headers.get('sw-cached-at') || '0') };
      });
    })).then(function (entries) {
      entries.sort(function (a, b) { return a.time - b.time; });
      var toDelete = entries.slice(0, entries.length - API_MAX_ENTRIES);
      toDelete.forEach(function (entry) { cache.delete(entry.key); });
    });
  });
}
