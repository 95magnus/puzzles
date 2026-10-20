import { test, expect, vi, afterEach } from 'vitest';
import { requestPuzzle, latestOnly, STALE } from '../../src/gen/client';
import { generate } from '../../src/core/generator';
import { mulberry32 } from '../../src/core/rng';

afterEach(() => vi.unstubAllGlobals());

test('falls back to main thread when Worker is unavailable', async () => {
  vi.stubGlobal('Worker', undefined);
  const p = await requestPuzzle(5, 99);
  expect(p).toEqual(generate(5, mulberry32(99)));
});

test('latestOnly marks earlier slow calls as STALE', async () => {
  const slowThenFast = latestOnly((ms: number, v: string) => new Promise<string>(r => setTimeout(() => r(v), ms)));
  const first = slowThenFast(50, 'old'), second = slowThenFast(1, 'new');
  expect(await second).toBe('new');
  expect(await first).toBe(STALE);
});

test('latestOnly resolves STALE for stale rejections, propagates latest rejection', async () => {
  const f = latestOnly((ms: number, fail: boolean) => new Promise<string>((res, rej) => setTimeout(() => (fail ? rej(new Error('x')) : res('ok')), ms)));
  const a = f(20, true), b = f(1, true);
  await expect(b).rejects.toThrow('x');
  expect(await a).toBe(STALE);
});
