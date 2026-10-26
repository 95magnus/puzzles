/**
 * The service worker: precaches the whole built site and serves it cache-first, so every page
 * works offline after one visit. build/offline.ts builds this into dist/sw.js and replaces the two
 * placeholders below. Import nothing from outside src/sw/: sw.js must stay one self-contained script.
 */
import { fillCache } from './install';
import { cachedOrNetwork } from './respond';
import { cacheKey } from './routes';

declare const __PRECACHE__: string[];
declare const __VERSION__: string;

const sw = self as unknown as ServiceWorkerGlobalScope;
const PRECACHE: readonly string[] = __PRECACHE__;
const CACHE = 'puzzles-' + __VERSION__;
const PREFIX = 'puzzles-';

sw.addEventListener('install', (event) => {
  // One failed file fails the whole install and the previous worker keeps serving its complete cache.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => fillCache(cache, PRECACHE, sw.registration.scope, __VERSION__, (req) => fetch(req)))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)))),
  );
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const scope = new URL(sw.registration.scope);
  const key = cacheKey(new URL(request.url), scope, PRECACHE);
  if (!key) return;
  event.respondWith(cachedOrNetwork(() => caches.open(CACHE), new URL(key, scope).href, request, (req) => fetch(req)));
});
