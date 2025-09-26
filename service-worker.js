const CACHE_VERSION = 'mi-prop-cache-v7';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './assets/background.jpg',
  './assets/overlay_vintage.jpg',
  './assets/fonts/digital-7.ttf',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './audio/1%E7%A7%92%E5%88%BB%E3%81%BFBEEP.mp3',
  './audio/BEEP%E5%85%A5%E5%8A%9B%E9%9F%B3.mp3',
  './audio/BEEP%E7%88%86%E7%99%BA%E6%99%82%E9%95%B7%E3%82%81%E3%81%AE%E9%9F%B3.mp3',
  './audio/BEEPerror.mp3',
  './audio/BGM.m4a',
  './videoes/BOM_video.mp4',
  './videoes/BestSpeed.mp4',
  './videoes/NormalSpeed.mp4',
  './videoes/BadSpeed.mp4'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await Promise.all(
      PRECACHE_ASSETS.map(async (asset) => {
        try {
          await cache.add(asset);
        } catch (error) {
          console.warn('[sw] precache skipped', asset, error);
        }
      })
    );
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
    );
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const { request } = event;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkThenCache(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

async function networkThenCache(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_VERSION);
    if (response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const fallback = await caches.match('./index.html');
    if (fallback) return fallback;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        if (response.status === 200) {
          cache.put(request, response.clone());
        }
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }

  const network = await networkPromise;
  if (network) {
    return network;
  }

  return caches.match('./index.html');
}
