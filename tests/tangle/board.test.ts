// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { BUMP_COOLDOWN_MS, arrowDist, bodyAt, createTangleBoard, fitCell, pickArrow, trackFor, type TangleBoardHandle } from '../../src/tangle/board';
import { newGame, tap } from '../../src/tangle/game';
import { PALETTE } from '../../src/ui/palette';
import { lvl } from './helpers';

let el: HTMLElement;
let board: TangleBoardHandle;
let taps: number[];

function stubMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({ matches: reduce && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })),
  );
}

function svg(): SVGSVGElement {
  return el.querySelector<SVGSVGElement>('svg.tangle-svg')!;
}

type Ptr = { button?: number; isPrimary?: boolean; pointerId?: number };

function pointer(type: string, x: number, y: number, { button = 0, isPrimary = true, pointerId = 1 }: Ptr = {}) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button });
  Object.defineProperty(ev, 'isPrimary', { value: isPrimary });
  Object.defineProperty(ev, 'pointerId', { value: pointerId });
  svg().dispatchEvent(ev);
}

/** A full primary tap: pointerdown then pointerup at the same spot. */
function tapAt(x: number, y: number, p: Ptr = {}) {
  pointer('pointerdown', x, y, p);
  pointer('pointerup', x, y, p);
}

function stubRect(w: number, h: number) {
  svg().getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0, toJSON() {} }) as DOMRect;
}

// 10×10: arrow 0 horizontal at row 0 pointing right (free), arrow 1 at row 5 pointing left (free),
// arrow 2 at (3,0)-(3,1) pointing right, blocked by arrow 3 at (3,5) pointing up.
const LEVEL = () => {
  const l = lvl(10, 10, [
    [[[0, 0], [0, 1], [0, 2]], 1],
    [[[5, 4], [5, 3]], 3],
    [[[3, 0], [3, 1]], 1],
    [[[4, 5], [3, 5]], 0],
  ]);
  l.arrows[1].color = 4;
  return l;
};

beforeEach(() => {
  el = document.createElement('div');
  document.body.appendChild(el);
  taps = [];
  board = createTangleBoard(el, { onTap: (c) => taps.push(c) });
});

afterEach(() => {
  board.destroy();
  el.remove();
  vi.unstubAllGlobals();
});

test('trackFor gives cell centres then a straight extension', () => {
  const l = lvl(5, 5, [[[[2, 0], [2, 1]], 1]]);
  expect(trackFor(l, 0, 2)).toEqual([
    [0.5, 2.5],
    [1.5, 2.5],
    [2.5, 2.5],
    [3.5, 2.5],
  ]);
});

test('bodyAt at offset 0 is the arrow itself; fractional offsets interpolate', () => {
  const l = lvl(6, 6, [[[[0, 0], [1, 0], [1, 1]], 1]]);
  const track = trackFor(l, 0, 3);
  expect(bodyAt(track, 3, 0)).toEqual(track.slice(0, 3));
  const b = bodyAt(track, 3, 1.5);
  expect(b[0][0]).toBeCloseTo((track[1][0] + track[2][0]) / 2);
  expect(b[0][1]).toBeCloseTo((track[1][1] + track[2][1]) / 2);
  expect(b.length).toBeLessThanOrEqual(4);
  const end = b[b.length - 1];
  expect(end[0]).toBeCloseTo((track[3][0] + track[4][0]) / 2);
  expect(end[1]).toBeCloseTo((track[3][1] + track[4][1]) / 2);
});

test('setGame renders one group per alive arrow', () => {
  const s = newGame(LEVEL());
  s.alive[2] = 0;
  board.setGame(s);
  const gs = [...el.querySelectorAll<SVGGElement>('g.tangle-arrow')];
  expect(gs.map((g) => g.dataset.a)).toEqual(['0', '1', '3']);
  expect(gs[1].style.getPropertyValue('--c')).toBe(PALETTE[4]);
  expect(gs[0].querySelector('path')).not.toBeNull();
  expect(gs[0].querySelector('polygon')).not.toBeNull();
  expect(svg().getAttribute('viewBox')).toBe('0 0 10 10');
  expect(el.querySelector('.tangle-panel.glass')).not.toBeNull();
});

test('a tap on an arrow reports its head cell', () => {
  board.setGame(newGame(LEVEL()));
  stubRect(300, 300);
  tapAt(15, 15); // tail cell of arrow 0
  expect(taps).toEqual([2]);
});

test('a tap just off an arrow still hits it; far from every arrow hits nothing', () => {
  board.setGame(newGame(LEVEL()));
  stubRect(300, 300);
  tapAt(45, 36); // empty cell (1,1), 0.7 cells below arrow 0's centre line
  expect(taps).toEqual([2]);
  tapAt(45, 42); // 0.9 cells below: outside the hit radius
  tapAt(295, 295);
  expect(taps).toEqual([2]);
});

test('pickArrow prefers the nearest centre line', () => {
  const l = LEVEL();
  const owner = new Int32Array(100).fill(-1);
  l.arrows.forEach((a, i) => a.cells.forEach((c) => (owner[c] = i)));
  // Between arrow 3's tail (4,5) and arrow 1's head (5,3) region: nearer arrow 3.
  expect(pickArrow(l, owner, [5.5, 4.2])).toBe(3);
  expect(arrowDist(l, 0, [1.5, 0.5])).toBe(0);
});

test('exit removes the arrow when play resolves', async () => {
  stubMotion(true);
  const s = newGame(LEVEL());
  board.setGame(s);
  const r = tap(s, 0);
  expect(r.kind).toBe('exit');
  await board.play(r);
  expect(el.querySelector('[data-a="0"]')).toBeNull();
  expect(el.querySelectorAll('g.tangle-arrow').length).toBe(3);
});

test('bump under reduced motion flashes arrow and blocker then resolves', async () => {
  stubMotion(true);
  vi.useFakeTimers();
  try {
    const s = newGame(LEVEL());
    board.setGame(s);
    const r = tap(s, 3 * 10);
    expect(r.kind).toBe('bump');
    const done = board.play(r);
    expect(el.querySelector('[data-a="2"]')!.classList.contains('is-bump')).toBe(true);
    expect(el.querySelector('[data-a="3"]')!.classList.contains('is-bump')).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    await done;
    expect(el.querySelector('[data-a="2"]')!.classList.contains('is-bump')).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test('ignored resolves at once', async () => {
  board.setGame(newGame(LEVEL()));
  await board.play({ kind: 'ignored' });
});

test('taps on a moving arrow are ignored; other arrows stay tappable', () => {
  stubMotion(false);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const s = newGame(LEVEL());
  board.setGame(s);
  stubRect(300, 300);
  void board.play(tap(s, 0));
  tapAt(45, 15); // arrow 0, still sliding out
  expect(taps).toEqual([]);
  tapAt(105, 165); // arrow 1 at (5,3)
  expect(taps).toEqual([53]);
});

test('a bumping arrow ignores taps until it is back', () => {
  stubMotion(false);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const s = newGame(LEVEL());
  board.setGame(s);
  stubRect(300, 300);
  void board.play(tap(s, 30));
  tapAt(15, 105); // arrow 2, mid-bump
  expect(taps).toEqual([]);
});

test('after a bump the whole board ignores taps until the cooldown ends', async () => {
  stubMotion(true);
  vi.useFakeTimers();
  try {
    const s = newGame(LEVEL());
    board.setGame(s);
    stubRect(300, 300);
    void board.play(tap(s, 30)); // arrow 2 bumps into arrow 3
    expect(el.classList.contains('tangle-board--stunned')).toBe(true);
    await vi.advanceTimersByTimeAsync(BUMP_COOLDOWN_MS - 50);
    tapAt(105, 165); // arrow 1 is free, but the board is still stunned
    expect(taps).toEqual([]);
    await vi.advanceTimersByTimeAsync(100);
    expect(el.classList.contains('tangle-board--stunned')).toBe(false);
    tapAt(105, 165);
    expect(taps).toEqual([53]);
  } finally {
    vi.useRealTimers();
  }
});

test('an exit does not stun the board', () => {
  stubMotion(true);
  const s = newGame(LEVEL());
  board.setGame(s);
  stubRect(300, 300);
  void board.play(tap(s, 0));
  tapAt(105, 165);
  expect(taps).toEqual([53]);
});

test('setGame clears a running cooldown', () => {
  stubMotion(true);
  const s = newGame(LEVEL());
  board.setGame(s);
  void board.play(tap(s, 30));
  board.setGame(newGame(LEVEL()));
  expect(el.classList.contains('tangle-board--stunned')).toBe(false);
});

test('the board draws a starfield behind the arrows', () => {
  board.setGame(newGame(LEVEL()));
  const layers = svg().querySelectorAll('rect.tangle-stars');
  expect(layers.length).toBe(2);
  expect(svg().firstElementChild!.tagName.toLowerCase()).toBe('defs');
  expect(svg().querySelector('g.tangle-arrow')!.compareDocumentPosition(layers[1])).toBe(Node.DOCUMENT_POSITION_PRECEDING);
});

test('setInteractive(false) blocks taps', () => {
  board.setGame(newGame(LEVEL()));
  stubRect(300, 300);
  board.setInteractive(false);
  tapAt(45, 15);
  expect(taps).toEqual([]);
  board.setInteractive(true);
  tapAt(45, 15);
  expect(taps).toEqual([2]);
});

test('animated exit and bump complete with real frames', async () => {
  stubMotion(false);
  let now = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb((now += 16)), 0) as unknown as number);
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  const s = newGame(LEVEL());
  board.setGame(s);
  const path = () => el.querySelector('[data-a="2"] path')!.getAttribute('d');
  const before = path();
  await board.play(tap(s, 30));
  expect(path()).toBe(before);
  expect(el.querySelector('[data-a="2"]')!.classList.contains('is-bump')).toBe(false);
  await board.play(tap(s, 0));
  expect(el.querySelector('[data-a="0"]')).toBeNull();
});

test('setGame during an animation cancels it without touching the new board', async () => {
  stubMotion(false);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const s = newGame(LEVEL());
  board.setGame(s);
  stubRect(300, 300);
  const p = board.play(tap(s, 0));
  board.setGame(newGame(LEVEL()));
  await p;
  expect(el.querySelector('[data-a="0"]')).not.toBeNull();
  stubRect(300, 300);
  tapAt(45, 15);
  expect(taps).toEqual([2]);
});

test('right-button release is not a tap', () => {
  board.setGame(newGame(LEVEL()));
  stubRect(300, 300);
  tapAt(45, 15, { button: 2 });
  pointer('pointerdown', 45, 15);
  pointer('pointerup', 45, 15, { button: 2 });
  expect(taps).toEqual([]);
});

test('pointerup without a matching pointerdown is not a tap', () => {
  board.setGame(newGame(LEVEL()));
  stubRect(300, 300);
  pointer('pointerup', 45, 15);
  expect(taps).toEqual([]);
  // A second finger lifting (non-primary, other id) does not count either.
  pointer('pointerdown', 45, 15, { pointerId: 1 });
  pointer('pointerup', 45, 15, { pointerId: 2, isPrimary: false });
  expect(taps).toEqual([]);
  // A cancelled press does not become a tap.
  pointer('pointerdown', 45, 15);
  pointer('pointercancel', 45, 15);
  pointer('pointerup', 45, 15);
  expect(taps).toEqual([]);
  tapAt(45, 15);
  expect(taps).toEqual([2]);
});

test('fitCell fits the smaller of width and height, clamped to [12, 28]', () => {
  expect(fitCell(40, 40, 1200, 520)).toBe(13);
  expect(fitCell(40, 40, 535, 2000)).toBe(13);
  expect(fitCell(40, 40, 100, 100)).toBe(12);
  expect(fitCell(10, 10, 5000, 5000)).toBe(28);
});
