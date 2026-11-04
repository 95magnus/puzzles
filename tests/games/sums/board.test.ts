// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createSumsBoard, sumsGrid, type SumsBoardHandle } from '../../../src/games/sums/board';
import { newGame, strike, toggleMark } from '../../../src/games/sums/game';
import type { GameState } from '../../../src/games/sums/types';
import { puzzle } from './helpers';

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7];
const KEEP: (0 | 1)[] = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1];
const SIZE = 5;
const TRACK = 50;

let host: HTMLElement;
let board: SumsBoardHandle;
let onStrike: ReturnType<typeof vi.fn<(cell: number) => void>>;
let onMark: ReturnType<typeof vi.fn<(cell: number) => void>>;

const grid = () => host.querySelector<HTMLElement>('.sums-grid')!;
const cellEl = (i: number) => host.querySelector<HTMLElement>(`.sums-cell[data-cell="${i}"]`)!;
const targetEl = (l: number) => host.querySelector<HTMLElement>(`.sums-target[data-line="${l}"]`)!;
const leftOf = (l: number) => targetEl(l).querySelector('.sums-target__left')!.textContent;

/** Client centre of digit cell i; the stubbed grid box has one track = 50 px, with the target row/column first. */
const px = (i: number): [number, number] => [TRACK + (i % SIZE) * TRACK + 25, TRACK + Math.floor(i / SIZE) * TRACK + 25];

function ptr(type: string, i: number, opts: { kind?: string; button?: number } = {}): MouseEvent {
  const [x, y] = px(i);
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: opts.button ?? 0 });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  Object.defineProperty(ev, 'pointerType', { value: opts.kind ?? 'mouse' });
  // Pointer capture retargets events to the grid, so dispatch there whatever the cell.
  grid().dispatchEvent(ev);
  return ev;
}
const click = (i: number) => {
  ptr('pointerdown', i);
  ptr('pointerup', i);
};
const contextmenu = (i: number): MouseEvent => {
  const [x, y] = px(i);
  const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 });
  grid().dispatchEvent(ev);
  return ev;
};

function mount(): GameState {
  const s = newGame(puzzle(SIZE, DIGITS, KEEP));
  board.setGame(s);
  grid().getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 300, height: 300, right: 300, bottom: 300, x: 0, y: 0, toJSON() {} }) as DOMRect;
  return s;
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  onStrike = vi.fn();
  onMark = vi.fn();
  board = createSumsBoard(host, { onStrike, onMark });
});

afterEach(() => {
  board.destroy();
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('renders size² cells and 2*size targets in a size+1 column grid', () => {
  mount();
  expect(host.querySelectorAll('button.sums-cell')).toHaveLength(25);
  expect(host.querySelectorAll('.sums-target')).toHaveLength(10);
  expect(host.querySelectorAll('.sums-corner')).toHaveLength(1);
  expect(grid().style.gridTemplateColumns).toBe('repeat(6, var(--cell))');
  expect(grid().style.touchAction).toBe('none');
  expect(cellEl(0).getAttribute('aria-label')).toBe('Row 1, column 1, 1');
  expect(cellEl(7).getAttribute('aria-label')).toBe('Row 2, column 3, 8');
  expect(targetEl(0).querySelector('.sums-target__sum')).toBeNull();
  expect(targetEl(0).children).toHaveLength(1);
  expect(targetEl(0).getAttribute('aria-label')).toBe('Row 1: needs 9');
  expect(targetEl(SIZE).getAttribute('aria-label')).toBe('Column 1: needs 6');
});

test('grid blocks selection and the touch callout inline', () => {
  mount();
  expect(grid().style.userSelect).toBe('none');
  // jsdom reports this vendor property only through the camel-case accessor, not getPropertyValue.
  expect((grid().style as unknown as Record<string, string>).webkitTouchCallout).toBe('none');
});

test('striking never changes the number; the check appears once only the right digits are left', () => {
  const s = mount();
  // Row 0 keeps 1, 3, 5 (target 9) and has 2 and 4 to lose; column 1 (2, 7, 3, 8, 4) has target 15.
  expect(leftOf(0)).toBe('9');
  expect(leftOf(SIZE + 1)).toBe('15');
  expect(strike(s, 1)).toBe('struck');
  board.render();
  expect(cellEl(1).dataset.state).toBe('struck');
  expect(cellEl(1).getAttribute('aria-label')).toBe('Row 1, column 2, 2, struck');
  expect(leftOf(0)).toBe('9');
  expect(leftOf(SIZE + 1)).toBe('15');
  expect(strike(s, 3)).toBe('struck');
  board.render();
  expect(leftOf(0)).toBe('✓');
  expect(targetEl(0).classList.contains('is-done')).toBe(true);
  expect(targetEl(0).getAttribute('aria-label')).toBe('Row 1: done');
  expect(targetEl(1).classList.contains('is-done')).toBe(false);
});

test('marking a digit lowers its row and column number; unmarking restores it', () => {
  const s = mount();
  toggleMark(s, 0); // a 1 in row 0, column 0
  board.render();
  expect(leftOf(0)).toBe('8');
  expect(leftOf(SIZE)).toBe('5');
  expect(targetEl(0).getAttribute('aria-label')).toBe('Row 1: needs 8');
  toggleMark(s, 0);
  board.render();
  expect(leftOf(0)).toBe('9');
});

test('a locked mistake counts as kept', () => {
  const s = mount();
  expect(strike(s, 0)).toBe('mistake');
  board.render();
  expect(leftOf(0)).toBe('8');
});

test('too many kept digits turn the number red with a minus sign', () => {
  const s = mount();
  for (const i of [0, 1, 2, 3]) toggleMark(s, i); // 1 + 2 + 3 + 4 = 10 against a target of 9
  board.render();
  expect(leftOf(0)).toBe('−1');
  expect(targetEl(0).classList.contains('is-over')).toBe(true);
  expect(targetEl(0).classList.contains('is-done')).toBe(false);
  expect(targetEl(0).getAttribute('aria-label')).toBe('Row 1: over by 1');
  toggleMark(s, 3);
  board.render();
  expect(leftOf(0)).toBe('3');
  expect(targetEl(0).classList.contains('is-over')).toBe(false);
});

test('zero is a plain 0, not a check, while a wrong digit is still open', () => {
  const s = mount();
  for (const i of [0, 2, 4]) toggleMark(s, i); // the three digits that belong
  board.render();
  expect(leftOf(0)).toBe('0');
  expect(targetEl(0).classList.contains('is-done')).toBe(false);
  expect(targetEl(0).classList.contains('is-over')).toBe(false);
});

test('striking every wrong digit gives the check whatever the marks are', () => {
  const s = mount();
  for (const i of [0, 1, 2, 3, 4]) toggleMark(s, i);
  strike(s, 1); // marked: ignored
  toggleMark(s, 1);
  toggleMark(s, 3);
  strike(s, 1);
  strike(s, 3);
  board.render();
  expect(leftOf(0)).toBe('✓');
  expect(targetEl(0).classList.contains('is-done')).toBe(true);
  expect(targetEl(0).classList.contains('is-over')).toBe(false);
});

test('marked and locked cells get their state and label', () => {
  const s = mount();
  s.cells[0] = 2;
  s.cells[2] = 3;
  board.render();
  expect(cellEl(0).dataset.state).toBe('marked');
  expect(cellEl(0).getAttribute('aria-label')).toBe('Row 1, column 1, 1, marked');
  expect(cellEl(2).dataset.state).toBe('locked');
  expect(cellEl(2).getAttribute('aria-label')).toBe('Row 1, column 3, 3, kept');
});

test('a finished line shows its digits locked and lowers the crossing numbers', () => {
  const s = mount();
  // Row 0 keeps 1, 3, 5 and loses cells 1 and 3; column 0 has target 6 and holds that 1.
  toggleMark(s, 2);
  strike(s, 1);
  board.render();
  expect(cellEl(0).dataset.state).toBe('open');
  expect(cellEl(2).dataset.state).toBe('marked');
  expect(leftOf(SIZE)).toBe('6');
  strike(s, 3);
  board.render();
  for (const i of [0, 2, 4]) expect(cellEl(i).dataset.state).toBe('locked');
  expect(cellEl(0).getAttribute('aria-label')).toBe('Row 1, column 1, 1, kept');
  expect(cellEl(1).dataset.state).toBe('struck');
  expect(cellEl(5).dataset.state).toBe('open');
  expect(leftOf(SIZE)).toBe('5');
});

test('mouse click strikes the cell under the pointer', () => {
  mount();
  click(7);
  expect(onStrike).toHaveBeenCalledExactlyOnceWith(7);
  expect(onMark).not.toHaveBeenCalled();
});

test('two clicks on different cells in a row strike twice', () => {
  mount();
  click(3);
  click(8);
  expect(onStrike.mock.calls).toEqual([[3], [8]]);
});

test('right-click marks and is default-prevented', () => {
  mount();
  const ev = contextmenu(12);
  expect(ev.defaultPrevented).toBe(true);
  expect(onMark).toHaveBeenCalledExactlyOnceWith(12);
});

test('a context menu during a mouse press marks and cancels the strike', () => {
  mount();
  ptr('pointerdown', 0);
  contextmenu(0);
  ptr('pointerup', 0);
  expect(onMark).toHaveBeenCalledExactlyOnceWith(0);
  expect(onStrike).not.toHaveBeenCalled();
});

test('touch tap strikes', () => {
  vi.useFakeTimers();
  mount();
  ptr('pointerdown', 4, { kind: 'touch' });
  vi.advanceTimersByTime(100);
  ptr('pointerup', 4, { kind: 'touch' });
  expect(onStrike).toHaveBeenCalledExactlyOnceWith(4);
  vi.advanceTimersByTime(1000);
  expect(onMark).not.toHaveBeenCalled();
});

test('touch long-press marks once and the up does nothing', () => {
  vi.useFakeTimers();
  mount();
  ptr('pointerdown', 6, { kind: 'touch' });
  vi.advanceTimersByTime(349);
  expect(onMark).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(onMark).toHaveBeenCalledExactlyOnceWith(6);
  ptr('pointerup', 6, { kind: 'touch' });
  expect(onStrike).not.toHaveBeenCalled();
  expect(onMark).toHaveBeenCalledTimes(1);
});

test('the contextmenu a touch long-press raises does not mark twice', () => {
  vi.useFakeTimers();
  mount();
  ptr('pointerdown', 6, { kind: 'touch' });
  vi.advanceTimersByTime(350);
  const ev = contextmenu(6);
  expect(ev.defaultPrevented).toBe(true);
  expect(onMark).toHaveBeenCalledTimes(1);
});

test('down on one cell and up on another does nothing', () => {
  mount();
  ptr('pointerdown', 0);
  ptr('pointerup', 1);
  expect(onStrike).not.toHaveBeenCalled();
  expect(onMark).not.toHaveBeenCalled();
});

test('moving off the cell cancels, even if the pointer returns', () => {
  vi.useFakeTimers();
  mount();
  ptr('pointerdown', 0, { kind: 'touch' });
  ptr('pointermove', 1, { kind: 'touch' });
  vi.advanceTimersByTime(500);
  ptr('pointermove', 0, { kind: 'touch' });
  ptr('pointerup', 0, { kind: 'touch' });
  expect(onStrike).not.toHaveBeenCalled();
  expect(onMark).not.toHaveBeenCalled();
});

test('pointercancel cancels the press', () => {
  vi.useFakeTimers();
  mount();
  ptr('pointerdown', 0, { kind: 'touch' });
  grid().dispatchEvent(new Event('pointercancel', { bubbles: true }));
  vi.advanceTimersByTime(500);
  ptr('pointerup', 0, { kind: 'touch' });
  expect(onStrike).not.toHaveBeenCalled();
  expect(onMark).not.toHaveBeenCalled();
});

test('pressing a target strikes nothing', () => {
  mount();
  for (const type of ['pointerdown', 'pointerup']) {
    const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 25, clientY: 75 });
    Object.defineProperty(ev, 'pointerType', { value: 'mouse' });
    grid().dispatchEvent(ev);
  }
  expect(onStrike).not.toHaveBeenCalled();
});

test('mistake flashes the cell, pauses input for 700 ms and resolves after', async () => {
  vi.useFakeTimers();
  mount();
  let done = false;
  const p = board.mistake(5).then(() => (done = true));
  expect(cellEl(5).classList.contains('is-bad')).toBe(true);
  expect(host.querySelector('.is-paused')).not.toBeNull();
  click(9);
  expect(onStrike).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(500);
  expect(cellEl(5).classList.contains('is-bad')).toBe(false);
  expect(done).toBe(false);
  await vi.advanceTimersByTimeAsync(200);
  await p;
  expect(done).toBe(true);
  expect(host.querySelector('.is-paused')).toBeNull();
  click(9);
  expect(onStrike).toHaveBeenCalledExactlyOnceWith(9);
});

test('setInteractive(false) ignores input', () => {
  mount();
  board.setInteractive(false);
  click(0);
  contextmenu(0);
  expect(onStrike).not.toHaveBeenCalled();
  expect(onMark).not.toHaveBeenCalled();
  board.setInteractive(true);
  click(0);
  expect(onStrike).toHaveBeenCalledTimes(1);
});

test('celebrate pulses then resolves; at once under reduced motion', async () => {
  vi.useFakeTimers();
  mount();
  let done = false;
  const p = board.celebrate().then(() => (done = true));
  expect(host.querySelector('.is-celebrating')).not.toBeNull();
  await vi.advanceTimersByTimeAsync(400);
  await p;
  expect(done).toBe(true);
  expect(host.querySelector('.is-celebrating')).toBeNull();

  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  await board.celebrate();
  expect(host.querySelector('.is-celebrating')).toBeNull();
});

test('sumsGrid is a static, non-interactive copy', () => {
  const p = puzzle(SIZE, DIGITS, KEEP);
  const cells = new Array(25).fill(0) as GameState['cells'];
  cells[1] = 1;
  const g = sumsGrid(p, cells);
  expect(g.classList.contains('sums-grid')).toBe(true);
  expect(g.querySelectorAll('.sums-cell')).toHaveLength(25);
  expect(g.querySelectorAll('button')).toHaveLength(0);
  expect(g.querySelector<HTMLElement>('.sums-cell[data-cell="1"]')!.dataset.state).toBe('struck');
  const row0 = () => g.querySelector('.sums-target[data-line="0"] .sums-target__left')!.textContent;
  expect(row0()).toBe('9');
  const marked = sumsGrid(p, cells.map((c, i) => (i === 0 ? 2 : c)) as GameState['cells']);
  expect(marked.querySelector('.sums-target[data-line="0"] .sums-target__left')!.textContent).toBe('8');
});

test('the grid is a labelled group', () => {
  mount();
  expect(grid().getAttribute('role')).toBe('group');
  expect(grid().getAttribute('aria-label')).toBe('Sums board');
});

test('a keyboard or assistive-tech click (detail 0) strikes the cell', () => {
  mount();
  cellEl(7).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
  expect(onStrike).toHaveBeenCalledTimes(1);
  expect(onStrike).toHaveBeenCalledWith(7);
});

test('a pointer click strikes exactly once, even with the click event that follows', () => {
  mount();
  click(7);
  cellEl(7).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  expect(onStrike).toHaveBeenCalledTimes(1);
  expect(onStrike).toHaveBeenCalledWith(7);
});

test('a detail-0 click is ignored while the board is locked or paused', () => {
  mount();
  board.setInteractive(false);
  cellEl(7).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
  expect(onStrike).not.toHaveBeenCalled();
});
