import { expect, test } from 'vitest';
import { fillCache } from '../../src/sw/install';

const scope = 'https://puzzles.solhaug.dev/';

function fakeCache() {
  const stored = new Map<string, Response>();
  return { stored, cache: { put: async (url: RequestInfo | URL, res: Response) => void stored.set(url instanceof Request ? url.url : url.toString(), res) } };
}

test('fetches with a version query that skips the HTTP cache, and stores under the clean URL', async () => {
  const { stored, cache } = fakeCache();
  const fetched: Request[] = [];
  await fillCache(cache, ['index.html', 'assets/a.js'], scope, 'abc123', async (req) => {
    fetched.push(req);
    return new Response('ok');
  });
  expect(fetched.map((r) => r.url)).toEqual([`${scope}index.html?v=abc123`, `${scope}assets/a.js?v=abc123`]);
  expect(fetched.every((r) => r.cache === 'reload')).toBe(true);
  expect([...stored.keys()]).toEqual([`${scope}index.html`, `${scope}assets/a.js`]);
});

test('stores nothing when any file fails', async () => {
  const { stored, cache } = fakeCache();
  const run = fillCache(cache, ['index.html', 'flow.html'], scope, 'v', async (req) =>
    req.url.includes('flow') ? new Response('missing', { status: 404 }) : new Response('ok'),
  );
  await expect(run).rejects.toThrow('flow.html');
  expect(stored.size).toBe(0);
});

test('refuses redirected responses', async () => {
  const { stored, cache } = fakeCache();
  const redirected = new Response('ok');
  Object.defineProperty(redirected, 'redirected', { value: true });
  await expect(fillCache(cache, ['index.html'], scope, 'v', async () => redirected)).rejects.toThrow('index.html');
  expect(stored.size).toBe(0);
});
