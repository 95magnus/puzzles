/**
 * The service worker: precaches the whole built site and serves it cache-first, so every page
 * works offline after one visit. build/offline.ts builds this into dist/sw.js and replaces the two
 * placeholders below. Import nothing from outside src/sw/: sw.js must stay one self-contained script.
 */
import { cacheKey } from './routes';

declare const __PRECACHE__: string[];
declare const __VERSION__: string;

const sw = self as unknown as ServiceWorkerGlobalScope;
const PRECACHE: readonly string[] = __PRECACHE__;
const CACHE = 'puzzles-' + __VERSION__;
const PREFIX = 'puzzles-';

sw.addEventListener('install', (event) => {
  // `reload` skips the HTTP cache, so an old page can't end up next to new bundles. One failed
  // file fails the whole install and the previous worker keeps serving its complete cache.
  const scope = sw.registration.scope;
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((p) => new Request(new URL(p, scope), { cache: 'reload' }))))
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
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(new URL(key, scope).href))
      .then((hit) => hit ?? fetch(request)),
  );
});
