type Fetch = (request: Request) => Promise<Response>;

/**
 * Downloads every precached path and stores it under its clean URL. The `?v=` query skips both the
 * HTTP cache and the GitHub Pages CDN, which can still serve the previous deploy's pages for a few
 * minutes after a deploy. Every file must arrive, unredirected (a redirected response can't answer a
 * navigation), before anything is stored, so a failed install leaves no half-filled cache.
 */
export async function fillCache(cache: Pick<Cache, 'put'>, paths: readonly string[], scope: string, version: string, fetchFn: Fetch): Promise<void> {
  const responses = await Promise.all(
    paths.map(async (path) => {
      const url = new URL(path, scope);
      const bust = new URL(url);
      bust.searchParams.set('v', version);
      const res = await fetchFn(new Request(bust, { cache: 'reload' }));
      if (!res.ok || res.redirected) throw new Error(`precache failed for ${path}: ${res.status}${res.redirected ? ' (redirected)' : ''}`);
      return [url.href, res] as const;
    }),
  );
  await Promise.all(responses.map(([url, res]) => cache.put(url, res)));
}
