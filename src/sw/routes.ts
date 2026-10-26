/**
 * Which precached file answers a request, or null to leave it to the network. `/` and paths
 * ending in `/` mean index.html, extensionless paths (`/flow`, which GitHub Pages also serves)
 * mean their .html page, and query and hash are ignored. Imports nothing: sw.js is built from this.
 */
export function cacheKey(url: URL, scope: URL, precache: readonly string[]): string | null {
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return null;
  let path = url.pathname.slice(scope.pathname.length);
  if (path === '' || path.endsWith('/')) path += 'index.html';
  else if (!path.slice(path.lastIndexOf('/') + 1).includes('.')) path += '.html';
  return precache.includes(path) ? path : null;
}
