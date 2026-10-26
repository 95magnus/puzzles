// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createBoard, type BoardHandle } from '../../src/mines/board';
import { newGame, restoreGame, reveal, toggleFlag } from '../../src/mines/game';
import type { InputAction } from '../../src/mines/input';
import type { GameState } from '../../src/mines/types';
import { boardFrom } from './helpers';

// (1,1) has adj 2; mines at (0,1) and (2,0).
const TWO = () => boardFrom(['.*...', '.....', '*....'], [0, 4]);
const idx = (r: number, c: number) => r * 5 + c;

let el: HTMLElement;
let board: BoardHandle;
let actions: InputAction[];
let hovered: number;

const cell = (i: number) => el.querySelector<HTMLElement>(`[data-i="${i}"]`)!;
const pressed = () => [...el.querySelectorAll<HTMLElement>('.is-pressed')].map((c) => Number(c.dataset.i)).sort((a, b) => a - b);

function fire(type: string, buttons: number, i: number, pointerType = 'mouse') {
  hovered = i;
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, buttons, clientX: 1, clientY: 1 });
  Object.defineProperty(ev, 'pointerType', { value: pointerType });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  el.querySelector('.mines-grid')!.dispatchEvent(ev);
  return ev;
}

function playing(): GameState {
  return restoreGame(TWO(), 'hhrrr' + 'hrrrr' + 'hhrrr', 'playing')!;
}

beforeEach(() => {
  el = document.createElement('div');
  document.body.appendChild(el);
  actions = [];
  hovered = -1;
  document.elementFromPoint = () => (hovered >= 0 ? cell(hovered) : document.body);
  board = createBoard(el, { onAction: (a) => actions.push(a) });
});

afterEach(() => {
  board.destroy();
  el.remove();
  vi.useRealTimers();
});

test('renders cols*rows cells with number, flag and hidden classes', () => {
  const s = playing();
  toggleFlag(s, idx(0, 1));
  board.setGame(s);
  expect(el.querySelectorAll('.mines-cell')).toHaveLength(15);
  expect(cell(idx(0, 0)).classList.contains('is-hidden')).toBe(true);
  expect(cell(idx(0, 1)).classList.contains('is-flagged')).toBe(true);
  expect(cell(idx(1, 1)).classList.contains('is-revealed')).toBe(true);
  expect(cell(idx(1, 1)).classList.contains('n2')).toBe(true);
  expect(cell(idx(1, 1)).textContent).toBe('2');
  expect(cell(idx(1, 4)).textContent).toBe('');
  expect((el.querySelector('.mines-grid') as HTMLElement).style.gridTemplateColumns).toBe('repeat(5, var(--cell))');
});

test('update() touches only the changed cells', () => {
  const s = playing();
  board.setGame(s);
  cell(idx(2, 4)).className = 'sentinel';
  const changed = toggleFlag(s, idx(0, 0));
  board.update(changed);
  expect(cell(idx(0, 0)).classList.contains('is-flagged')).toBe(true);
  expect(cell(idx(2, 4)).className).toBe('sentinel');
});

test('left press shows is-pressed; release calls onAction reveal', () => {
  board.setGame(playing());
  fire('pointerdown', 1, idx(0, 0));
  expect(pressed()).toEqual([idx(0, 0)]);
  fire('pointerup', 0, idx(0, 0));
  expect(pressed()).toEqual([]);
  expect(actions).toEqual([{ kind: 'reveal', cell: idx(0, 0) }]);
});

test('right press flags immediately', () => {
  board.setGame(playing());
  fire('pointerdown', 2, idx(0, 0));
  expect(actions).toEqual([{ kind: 'flag', cell: idx(0, 0) }]);
});

test('both buttons show chord preview on cell + hidden unflagged neighbours only', () => {
  const s = playing();
  toggleFlag(s, idx(0, 1));
  board.setGame(s);
  fire('pointerdown', 1, idx(1, 1));
  fire('pointermove', 3, idx(1, 1));
  // neighbours of (1,1): hidden (0,0),(1,0),(2,0),(2,1); flagged (0,1) excluded; revealed ones excluded
  expect(pressed()).toEqual([idx(0, 0), idx(1, 0), idx(1, 1), idx(2, 0), idx(2, 1)]);
  fire('pointermove', 1, idx(1, 1));
  expect(actions).toEqual([{ kind: 'chord', cell: idx(1, 1) }]);
  expect(pressed()).toEqual([]);
});

test('contextmenu is prevented on the board', () => {
  board.setGame(playing());
  const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  cell(0).dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(true);
});

// Review Focus 1
test('window blur while pressed clears is-pressed and sends no action', () => {
  board.setGame(playing());
  fire('pointerdown', 1, idx(0, 0));
  window.dispatchEvent(new Event('blur'));
  expect(pressed()).toEqual([]);
  fire('pointerup', 0, idx(0, 0));
  expect(actions).toEqual([]);
});

test('setInteractive(false) ignores input', () => {
  board.setGame(playing());
  board.setInteractive(false);
  fire('pointerdown', 1, idx(0, 0));
  fire('pointerup', 0, idx(0, 0));
  expect(actions).toEqual([]);
  expect(pressed()).toEqual([]);
  board.setInteractive(true);
  fire('pointerdown', 1, idx(0, 0));
  fire('pointerup', 0, idx(0, 0));
  expect(actions).toEqual([{ kind: 'reveal', cell: idx(0, 0) }]);
});

test('touch long press sends a flag after 350 ms', () => {
  vi.useFakeTimers();
  board.setGame(playing());
  fire('pointerdown', 1, idx(0, 0), 'touch');
  vi.advanceTimersByTime(349);
  expect(actions).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(actions).toEqual([{ kind: 'flag', cell: idx(0, 0) }]);
  fire('pointerup', 0, idx(0, 0), 'touch');
  expect(actions).toHaveLength(1);
});

test('after loss: exploded cell, all mines shown, wrong flags marked', () => {
  const s = playing();
  toggleFlag(s, idx(1, 0)); // wrong flag
  board.setGame(s);
  board.update(reveal(s, idx(2, 0)));
  expect(s.status).toBe('lost');
  expect(cell(idx(2, 0)).classList.contains('is-exploded')).toBe(true);
  expect(cell(idx(0, 1)).classList.contains('is-mine')).toBe(true);
  expect(cell(idx(1, 0)).classList.contains('is-wrong-flag')).toBe(true);
  expect(cell(idx(0, 0)).classList.contains('is-hidden')).toBe(true);
});

test('cell size fits both width and viewport height, clamped to 20–32px', () => {
  const big = boardFrom(Array.from({ length: 20 }, () => '.'.repeat(30)), [0, 0]);
  Object.defineProperty(el, 'clientWidth', { value: 1240, configurable: true });
  const grid = () => (el.querySelector('.mines-grid') as HTMLElement).style.getPropertyValue('--cell');
  vi.stubGlobal('innerHeight', 720);
  board.setGame(newGame(big));
  // height: (720 - 200 chrome - 19 gaps * 2) / 20 rows = 24.1 → 24
  expect(grid()).toBe('24px');
  vi.stubGlobal('innerHeight', 2000);
  board.setGame(newGame(big));
  expect(grid()).toBe('32px');
  vi.stubGlobal('innerHeight', 300);
  board.setGame(newGame(big));
  expect(grid()).toBe('20px');
  vi.unstubAllGlobals();
});

test('newGame renders the opening', () => {
  board.setGame(newGame(TWO()));
  expect(cell(idx(0, 4)).classList.contains('is-revealed')).toBe(true);
});
