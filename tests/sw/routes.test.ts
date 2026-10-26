import { expect, test } from 'vitest';
import { cacheKey } from '../../src/sw/routes';

const scope = new URL('https://puzzles.solhaug.dev/');
const precache = ['index.html', 'flow.html', 'assets/flow-abc.js'];
const key = (path: string, s = scope, p = precache) => cacheKey(new URL(path, s), s, p);

test('maps the root to index.html', () => {
  expect(key('/')).toBe('index.html');
});

test('keeps explicit html paths', () => {
  expect(key('/index.html')).toBe('index.html');
  expect(key('/flow.html')).toBe('flow.html');
});

test('adds .html to extensionless paths', () => {
  expect(key('/flow')).toBe('flow.html');
});

test('ignores query and hash', () => {
  expect(key('/flow.html?x=1#/practice')).toBe('flow.html');
  expect(key('/?source=pwa')).toBe('index.html');
});

test('returns hashed assets as-is', () => {
  expect(key('/assets/flow-abc.js')).toBe('assets/flow-abc.js');
});

test('returns null outside the precache', () => {
  expect(key('/og.png')).toBeNull();
  expect(key('/nope.html')).toBeNull();
  expect(key('/flow/')).toBeNull();
});

test('returns null for other origins', () => {
  expect(cacheKey(new URL('https://cloud.umami.is/script.js'), scope, precache)).toBeNull();
});

test('handles a sub-path scope', () => {
  const s = new URL('https://x.github.io/puzzles/');
  expect(key('/puzzles/', s)).toBe('index.html');
  expect(key('/puzzles/flow', s)).toBe('flow.html');
  expect(key('/flow.html', s)).toBeNull();
});
