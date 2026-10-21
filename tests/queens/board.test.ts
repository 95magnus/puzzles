// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test } from 'vitest';
import { createQueensBoard, regionEdges, type QueensBoardHandle } from '../../src/queens/board';
import { cycle, newGame } from '../../src/queens/game';
import type { InputAction } from '../../src/queens/input';
import { PALETTE } from '../../src/ui/palette';
import { UNIQUE4, pz } from './helpers';

let el: HTMLElement;
let board: QueensBoardHandle;
let actions: InputAction[];

const cell = (i: number) => el.querySelector<HTMLElement>(`[data-i="${i}"]`)!;
const grid = () => el.querySelector<HTMLElement>('.queens-grid')!;

function at(type: string, x: number, y: number) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  Object.defineProperty(ev, 'pointerType', { value: 'mouse' });
  grid().dispatchEvent(ev);
}

beforeEach(() => {
  el = document.createElement('div');
  document.body.appendChild(el);
  actions = [];
  board = createQueensBoard(el, { onAction: (a) => actions.push(a) });
  grid().getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect;
});

afterEach(() => {
  board.destroy();
  el.remove();
});

test('regionEdges marks region and board borders', () => {
  const p = pz(UNIQUE4);
  expect(regionEdges(p, 0)).toEqual({ t: true, r: true, b: false, l: true });
  expect(regionEdges(p, 5)).toEqual({ t: true, r: false, b: true, l: true });
});

test('setGame renders size² cells with palette and edge classes', () => {
  const p = pz(UNIQUE4);
  board.setGame(newGame(p));
  expect(el.querySelectorAll('.queens-cell')).toHaveLength(16);
  expect(grid().style.getPropertyValue('--n')).toBe('4');
  expect(cell(0).style.getPropertyValue('--c')).toBe(PALETTE[1]);
  expect(cell(1).style.getPropertyValue('--c')).toBe(PALETTE[0]);
  expect(cell(0).classList.contains('e-t')).toBe(true);
  expect(cell(0).classList.contains('e-b')).toBe(false);
});

test('update applies mark, queen and conflict classes', () => {
  const s = newGame(pz(UNIQUE4));
  cycle(s, 0); cycle(s, 0); // queen
  cycle(s, 3); cycle(s, 3); // queen, same row
  cycle(s, 5); // mark
  board.setGame(s);
  expect(cell(5).classList.contains('is-mark')).toBe(true);
  for (const i of [0, 3]) {
    expect(cell(i).classList.contains('is-queen')).toBe(true);
    expect(cell(i).classList.contains('is-conflict')).toBe(true);
  }
  cycle(s, 3); // queen -> empty
  board.update([3]);
  expect(cell(3).classList.contains('is-queen')).toBe(false);
  expect(cell(0).classList.contains('is-conflict')).toBe(false);
});

test('tap maps to the right cell', () => {
  board.setGame(newGame(pz(UNIQUE4)));
  at('pointerdown', 150, 50);
  at('pointerup', 150, 50);
  expect(actions).toEqual([{ kind: 'tap', cell: 1 }]);
});

test('drag emits paint actions', () => {
  board.setGame(newGame(pz(UNIQUE4)));
  at('pointerdown', 50, 50);
  at('pointermove', 150, 50);
  at('pointermove', 250, 50);
  at('pointerup', 250, 50);
  expect(actions).toHaveLength(2);
  expect(actions.every((a) => a.kind === 'paint')).toBe(true);
  expect((actions[0] as { gesture: number }).gesture).toBe((actions[1] as { gesture: number }).gesture);
});

test('setInteractive(false) blocks input', () => {
  board.setGame(newGame(pz(UNIQUE4)));
  board.setInteractive(false);
  at('pointerdown', 150, 50);
  at('pointerup', 150, 50);
  expect(actions).toEqual([]);
});

test('aria-label reflects the state', () => {
  const s = newGame(pz(UNIQUE4));
  board.setGame(s);
  expect(cell(5).getAttribute('aria-label')).toBe('Row 2, column 2, empty');
  cycle(s, 5);
  board.update([5]);
  expect(cell(5).getAttribute('aria-label')).toBe('Row 2, column 2, marked');
  cycle(s, 5);
  board.update([5]);
  expect(cell(5).getAttribute('aria-label')).toBe('Row 2, column 2, queen');
});

test('celebrate resolves under reduced motion', async () => {
  board.setGame(newGame(pz(UNIQUE4)));
  await board.celebrate();
});
