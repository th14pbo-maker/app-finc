// Finance OS Service Worker — Offline-first local capability
const CACHE_NAME = 'finance-os-v29';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/favicon.svg',
  './assets/inter.woff2',
  './assets/geist.woff2',
  './styles/tokens.css',
  './styles/app.css',
  './styles/assistant.css',
  './js/app.mjs',
  './js/store.mjs',
  './js/initial-state.mjs',
  './js/domain.mjs',
  './js/classification.mjs',
  './js/backup.mjs',
  './js/flow-data.mjs',
  './js/goal-analytics.mjs',
  './js/import-payload.mjs',
  './js/supabase-config.mjs',
  './js/supabase.mjs',
  './js/sync.mjs',
  './js/profile.mjs',
  './js/ui.mjs',
  './js/currency.mjs',
  './js/projection.mjs',
  './js/speech.mjs',
  './js/assistant.mjs',
  './js/views/assistant.mjs',
  './js/views/sidebar-assistant.mjs',
  './js/views/metric-quick.mjs',
  './js/views/account-form.mjs',
  './js/views/projection.mjs',
  './js/workspace-menu.mjs',
  './js/views/overview.mjs',
  './js/views/transactions.mjs',
  './js/views/cards.mjs',
  './js/views/goals.mjs',
  './js/views/goal-insights.mjs',
  './js/views/flow-chart.mjs',
  './js/views/profile.mjs',
  './js/views/settings.mjs'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // 1. Ignore non-GET requests or internal server health checks
  if (event.request.method !== 'GET' || event.request.url.includes('__finance_os_health')) {
    return;
  }

  // 2. CRITICAL: Never cache Supabase Auth, REST or RPC requests
  const url = event.request.url;
  if (url.includes('/auth/v1/') || url.includes('/rest/v1/') || url.includes(':54321') || url.includes('.supabase.co')) {
    return; // Let browser make direct network request
  }

  // 3. Cache-first strategy for local application assets
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        return response;
      }).catch(() => {
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
