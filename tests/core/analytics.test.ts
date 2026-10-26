// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { COUNTED_ACTIONS, createPlayTracker, resetErrorsForTest, track, trackErrors } from '../../src/core/analytics';

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

describe('trackErrors', () => {
  let spy: ReturnType<typeof vi.fn<(event: string, data?: unknown) => void>>;
  const fail = (message: string, filename = '', lineno = 0) =>
    window.dispatchEvent(new ErrorEvent('error', { message, filename, lineno }));
  const reject = (reason: unknown) => {
    const ev = new Event('unhandledrejection');
    Object.defineProperty(ev, 'reason', { value: reason });
    window.dispatchEvent(ev);
  };

  beforeAll(() => trackErrors('home'));
  beforeEach(() => {
    resetErrorsForTest();
    spy = vi.fn<(event: string, data?: unknown) => void>();
    w.umami = { track: spy };
  });

  test('an uncaught error sends page, message and file:line', () => {
    fail('Boom', 'https://puzzles.solhaug.dev/assets/app-3fa1.js', 42);
    expect(spy).toHaveBeenCalledWith('error', { page: 'home', message: 'Boom', where: 'app-3fa1.js:42' });
  });

  test('cuts the message to 120 characters', () => {
    fail(`  ${'x'.repeat(200)}  `);
    expect(spy).toHaveBeenCalledWith('error', { page: 'home', message: 'x'.repeat(120), where: '' });
  });

  test('skips "Script error." and empty messages', () => {
    fail('Script error.');
    fail('   ');
    expect(spy).not.toHaveBeenCalled();
  });

  test('sends each distinct message once and at most 3 per page', () => {
    for (const m of ['a', 'a', 'b', 'c', 'd']) fail(m);
    expect(spy.mock.calls.map(([, d]) => (d as { message: string }).message)).toEqual(['a', 'b', 'c']);
  });

  test('an unhandled rejection sends its reason', () => {
    reject(new Error('nope'));
    reject('str');
    expect(spy.mock.calls).toEqual([
      ['error', { page: 'home', message: 'nope', where: '' }],
      ['error', { page: 'home', message: 'str', where: '' }],
    ]);
  });

  test('calling trackErrors again adds no second listener', () => {
    trackErrors('home');
    fail('once');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('a throwing tracker does not throw out of the listener', () => {
    w.umami = { track: () => { throw new Error('blocked'); } };
    expect(() => fail('Boom')).not.toThrow();
  });
});
