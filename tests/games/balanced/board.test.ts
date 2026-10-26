// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBalancedBoard, type BalancedBoardHandle } from '../../../src/games/balanced/board';
import { cycle, newGame, undo } from '../../../src/games/balanced/game';
import { DEDUCE4 } from './helpers';

let host: HTMLElement;
let board: BalancedBoardHandle | null = null;

function mount(onTap = vi.fn()) {
  host = document.createElement('div');
  document.body.appendChild(host);
  board = createBalancedBoard(host, { onTap, onRing: vi.fn() });
  const s = newGame(DEDUCE4);
  board.setGame(s);
  return { s, onTap };
}

const cell = (i: number) => host.querySelector<HTMLElement>(`.balanced-cell[data-i="${i}"]`)!;

afterEach(() => {
  board?.destroy();
  board = null;
  document.body.textContent = '';
});

describe('balanced board', () => {
  it('setGame renders size² cells and one badge per edge', () => {
    mount();
    expect(host.querySelectorAll('.balanced-cell')).toHaveLength(16);
    expect(cell(2).classList.contains('is-given')).toBe(true);
    expect(cell(2).dataset.sym).toBe('2');
    expect(cell(2).querySelector('svg')).not.toBeNull();
    expect(cell(0).dataset.sym).toBe('0');
    expect(cell(0).getAttribute('aria-label')).toBe('Row 1, column 1, empty');
    expect(cell(2).getAttribute('aria-label')).toBe('Row 1, column 3, ring, given');
    const edges = host.querySelectorAll<HTMLElement>('.balanced-edge');
    expect(edges).toHaveLength(1);
    expect(edges[0].dataset.kind).toBe('neq');
    expect(edges[0].classList.contains('is-v')).toBe(true);
    expect(edges[0].textContent).toBe('×');
  });

  it('click calls onTap for non-givens only', () => {
    const { onTap } = mount();
    cell(0).click();
    expect(onTap).toHaveBeenCalledWith(0);
    cell(2).click();
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('render shows symbols and violation classes', () => {
    const { s } = mount();
    cycle(s, 1); // dot
    cycle(s, 5); // dot — breaks the × on 1–5
    board!.render();
    expect(cell(1).dataset.sym).toBe('1');
    expect(cell(1).getAttribute('aria-label')).toBe('Row 1, column 2, dot');
    expect(host.querySelector('.balanced-edge')!.classList.contains('is-broken')).toBe(true);
  });

  it('render clears violation classes after undo', () => {
    const { s } = mount();
    cycle(s, 1);
    cycle(s, 5);
    board!.render();
    undo(s);
    board!.render();
    expect(host.querySelectorAll('.is-broken')).toHaveLength(0);
    expect(cell(5).dataset.sym).toBe('0');
  });

  it('marks triples and over-full lines', () => {
    const { s } = mount();
    // Column 0: cell 8 is a given dot; make 0 and 4 dots too → a vertical triple and 3 dots in a 4-line.
    cycle(s, 0);
    cycle(s, 4);
    board!.render();
    for (const i of [0, 4, 8]) expect(cell(i).classList.contains('is-triple')).toBe(true);
    // One capsule spans the whole run instead of a box per cell.
    const runs = host.querySelectorAll<HTMLElement>('.balanced-run');
    expect(runs).toHaveLength(1);
    expect(runs[0].classList.contains('is-v')).toBe(true);
    expect([runs[0].style.getPropertyValue('--r'), runs[0].style.getPropertyValue('--c'), runs[0].style.getPropertyValue('--len')]).toEqual(['0', '0', '3']);
    for (const i of [0, 4, 8, 12]) expect(cell(i).classList.contains('in-bad-line')).toBe(true);
    expect(cell(1).classList.contains('in-bad-line')).toBe(false);
    undo(s);
    board!.render();
    expect(host.querySelectorAll('.balanced-run')).toHaveLength(0);
  });

  it('right-click calls onRing for non-givens and suppresses the menu', () => {
    const onRing = vi.fn();
    host = document.createElement('div');
    document.body.appendChild(host);
    board = createBalancedBoard(host, { onTap: vi.fn(), onRing });
    board.setGame(newGame(DEDUCE4));
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    cell(0).dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(onRing).toHaveBeenCalledWith(0);
    cell(2).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    expect(onRing).toHaveBeenCalledTimes(1);
  });

  it('setInteractive(false) blocks taps', () => {
    const { onTap } = mount();
    board!.setInteractive(false);
    cell(0).click();
    expect(onTap).not.toHaveBeenCalled();
  });
});
