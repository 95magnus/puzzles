type Fetch = (request: Request) => Promise<Response>;

/**
 * The precached copy of `url`, or the network when it isn't cached or the cache itself fails
 * (storage pressure, eviction): a broken cache must never turn into a failed page load online.
 */
export async function cachedOrNetwork(open: () => Promise<Pick<Cache, 'match'>>, url: string, request: Request, fetchFn: Fetch): Promise<Response> {
  try {
    const hit = await (await open()).match(url);
    if (hit) return hit;
  } catch {
    /* fall through to the network */
  }
  return fetchFn(request);
}
