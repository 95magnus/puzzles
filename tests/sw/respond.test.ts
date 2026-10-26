import { expect, test } from 'vitest';
import { cachedOrNetwork } from '../../src/sw/respond';

const request = new Request('https://puzzles.solhaug.dev/flow.html');
const network = async () => new Response('network');
const cacheWith = (hit: Response | undefined) => async () => ({ match: async () => hit });

test('serves a cache hit', async () => {
  const res = await cachedOrNetwork(cacheWith(new Response('cached')), 'flow.html', request, network);
  expect(await res.text()).toBe('cached');
});

test('falls back to the network on a miss', async () => {
  const res = await cachedOrNetwork(cacheWith(undefined), 'flow.html', request, network);
  expect(await res.text()).toBe('network');
});

test('falls back to the network when the cache cannot be opened', async () => {
  const res = await cachedOrNetwork(() => Promise.reject(new Error('quota')), 'flow.html', request, network);
  expect(await res.text()).toBe('network');
});

test('falls back to the network when the lookup fails', async () => {
  const broken = async () => ({ match: () => Promise.reject(new Error('evicted')) });
  const res = await cachedOrNetwork(broken, 'flow.html', request, network);
  expect(await res.text()).toBe('network');
});
