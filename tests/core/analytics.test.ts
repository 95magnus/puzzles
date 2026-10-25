// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { createPlayTracker, track } from '../../src/core/analytics';

const w = window as { umami?: { track: (event: string, data?: unknown) => void } };

afterEach(() => {
  delete w.umami;
});

test('track is a no-op without the tracker script, and swallows tracker errors', () => {
  expect(() => track('x')).not.toThrow();
  w.umami = { track: () => { throw new Error('blocked'); } };
  expect(() => track('x')).not.toThrow();
});

test('play tracker reports one start per board and one end', () => {
  const spy = vi.fn();
  w.umami = { track: spy };
  const play = createPlayTracker('queens');

  play.move(); // no board yet
  play.begin({ mode: 'daily' });
  play.move();
  play.move();
  play.end('won', 94_400);
  play.end('won', 95_000);

  expect(spy.mock.calls).toEqual([
    ['puzzle_start', { game: 'queens', mode: 'daily' }],
    ['puzzle_end', { game: 'queens', mode: 'daily', result: 'won', seconds: 94 }],
  ]);

  spy.mockClear();
  play.begin({ mode: 'practice', preset: 'small' });
  play.move();
  expect(spy).toHaveBeenCalledWith('puzzle_start', { game: 'queens', mode: 'practice', preset: 'small' });
});
