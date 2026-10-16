// Service worker: cache de assets estáticos + imagens TMDB, com fallback offline.
const VERSION = 'v2';
const STATIC_CACHE = `caponioflix-static-${VERSION}`;
const IMG_CACHE = `caponioflix-img-${VERSION}`;
const IMG_CACHE_MAX = 150;

const STATIC_ASSETS = [
    './',
    './index.html',
    './styles.css',
    './helpers.js',
    './app.js',
    './logo.png',
    './icon-192.png',
    './icon-512.png',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key !== STATIC_CACHE && key !== IMG_CACHE)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        const fallback = await caches.match('./index.html');
        if (fallback && request.mode === 'navigate') return fallback;
        throw err;
    }
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(IMG_CACHE);
    const cached = await cache.match(request);
    const network = fetch(request)
        .then(async (response) => {
            if (response.ok) {
                cache.put(request, response.clone());
                const keys = await cache.keys();
                if (keys.length > IMG_CACHE_MAX) {
                    await cache.delete(keys[0]);
                }
            }
            return response;
        })
        .catch(() => null);
    if (cached) {
        network.catch(() => {});
        return cached;
    }
    const response = await network;
    if (response) return response;
    throw new Error('Offline e sem cache');
}

async function networkFirst(request) {
    try {
        const response = await fetch(request);
        return response;
    } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response(
            JSON.stringify({ error: 'Sem conexão' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Imagens TMDB: stale-while-revalidate com limite de cache
    if (url.hostname === 'image.tmdb.org') {
        event.respondWith(staleWhileRevalidate(request));
        return;
    }

    // API TMDB: network-first com fallback ao cache
    if (url.hostname === 'api.themoviedb.org') {
        event.respondWith(networkFirst(request));
        return;
    }

    // Fontes Google: cache-first
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        event.respondWith(cacheFirst(request));
        return;
    }

    // Assets próprios: cache-first com fallback offline
    if (url.origin === self.location.origin) {
        event.respondWith(cacheFirst(request));
    }
    // Demais origens (Firebase etc.): deixa passar direto
});
