// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { COUNTED_ACTIONS, createPlayTracker, track } from '../../src/core/analytics';

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
    ['puzzle_end', { game: 'queens', mode: 'daily', result: 'won', seconds: 94, moves: 2 }],
  ]);

  spy.mockClear();
  play.begin({ mode: 'practice', preset: 'small' });
  play.move();
  expect(spy).toHaveBeenCalledWith('puzzle_start', { game: 'queens', mode: 'practice', preset: 'small' });
});

test('puzzle_end carries moves and zero-filled counted actions, reset per board', () => {
  const spy = vi.fn();
  w.umami = { track: spy };
  const play = createPlayTracker('queens', COUNTED_ACTIONS);
  play.action('undo'); // no board yet
  play.begin({ mode: 'daily', day: '2026-10-27', restored: 0 });
  play.move();
  play.move();
  play.action('undo');
  play.action('hint'); // not counted
  play.move();
  play.end('won', 10_000);
  expect(spy).toHaveBeenLastCalledWith('puzzle_end', {
    game: 'queens', mode: 'daily', day: '2026-10-27', restored: 0, result: 'won', seconds: 10, moves: 3, undo: 1, clear: 0,
  });
  play.action('clear'); // after end
  play.begin({ mode: 'daily', day: '2026-10-27', restored: 1 });
  play.move();
  play.end('lost', 0);
  expect(spy).toHaveBeenLastCalledWith('puzzle_end', expect.objectContaining({ restored: 1, moves: 1, undo: 0, clear: 0 }));
});

test('a tracker without counted actions reports only moves', () => {
  const spy = vi.fn();
  w.umami = { track: spy };
  const play = createPlayTracker('tangle');
  play.begin({ mode: 'practice', preset: 'small' });
  play.move();
  play.action('undo');
  play.end('won', 0);
  expect(spy).toHaveBeenLastCalledWith('puzzle_end', { game: 'tangle', mode: 'practice', preset: 'small', result: 'won', seconds: 0, moves: 1 });
});
