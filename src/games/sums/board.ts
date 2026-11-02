import { remaining } from './game';
import type { Cell, GameState, Puzzle } from './types';
import { cellFromPoint } from '../../ui/grid';
import { PANEL_PAD, PAGE_CHROME, fitCell, reducedMotion, watchSize } from '../../ui/fit';

export const MISTAKE_PAUSE_MS = 700;
export const LONG_PRESS_MS = 350;
const FLASH_MS = 500;
const PULSE_MS = 400;
/** A touch long-press raises `contextmenu` shortly after; ignore it for this long after a touch down. */
const TOUCH_MENU_GRACE_MS = 1000;
const MIN_CELL = 30;
const MAX_CELL = 56;

export type SumsBoardHandle = {
  /** Show a new or restored game. */
  setGame(s: GameState): void;
  /** Repaint from the current state (the app mutates it in place). */
  render(): void;
  /** Flash the cell red and ignore input for `MISTAKE_PAUSE_MS`; resolves when the pause ends. */
  mistake(cell: number): Promise<void>;
  /** Pulse the remaining digits once; resolves at once under reduced motion. */
  celebrate(): Promise<void>;
  setInteractive(on: boolean): void;
  destroy(): void;
};

type Built = { grid: HTMLElement; cells: HTMLElement[]; targets: HTMLElement[] };

const STATE = ['open', 'struck', 'marked', 'locked'] as const;

function build(size: number, interactive: boolean): Built {
  const grid = document.createElement('div');
  grid.className = 'sums-grid';
  grid.style.gridTemplateColumns = `repeat(${size + 1}, var(--cell))`;
  const cells: HTMLElement[] = new Array(size * size);
  const targets: HTMLElement[] = new Array(2 * size);
  const target = (line: number): HTMLElement => {
    const t = document.createElement('div');
    t.className = 'sums-target';
    t.dataset.line = String(line);
    const sum = document.createElement('span');
    sum.className = 'sums-target__sum';
    const left = document.createElement('span');
    left.className = 'sums-target__left';
    t.append(sum, left);
    targets[line] = t;
    return t;
  };
  const corner = document.createElement('div');
  corner.className = 'sums-corner';
  grid.appendChild(corner);
  for (let c = 0; c < size; c++) grid.appendChild(target(size + c));
  for (let r = 0; r < size; r++) {
    grid.appendChild(target(r));
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      const el = document.createElement(interactive ? 'button' : 'div');
      if (el instanceof HTMLButtonElement) el.type = 'button';
      el.className = 'sums-cell';
      el.dataset.cell = String(i);
      cells[i] = el;
      grid.appendChild(el);
    }
  }
  return { grid, cells, targets };
}

function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function paint(b: Built, s: GameState, bad: number): void {
  const { size, digits, targets } = s.puzzle;
  for (let i = 0; i < size * size; i++) {
    const el = b.cells[i];
    const v = s.cells[i];
    const state = STATE[v];
    if (el.dataset.state !== state) el.dataset.state = state;
    setText(el, String(digits[i]));
    const suffix = v === 1 ? ', struck' : v === 2 ? ', marked' : v === 3 ? ', kept' : '';
    const label = `Row ${Math.floor(i / size) + 1}, column ${(i % size) + 1}, ${digits[i]}${suffix}`;
    if (b.cells[i].tagName === 'BUTTON' && el.getAttribute('aria-label') !== label) el.setAttribute('aria-label', label);
    el.classList.toggle('is-bad', i === bad);
  }
  for (let l = 0; l < 2 * size; l++) {
    const t = b.targets[l];
    const left = remaining(s, l);
    const done = left <= 0;
    t.classList.toggle('is-done', done);
    setText(t.querySelector('.sums-target__sum')!, String(targets[l]));
    setText(t.querySelector('.sums-target__left')!, done ? '✓' : '−' + left);
  }
}

/** A static, non-interactive grid for the how-to and the dashboard preview. */
export function sumsGrid(p: Puzzle, cells: Cell[]): HTMLElement {
  const b = build(p.size, false);
  paint(b, { puzzle: p, cells, lives: 0, status: 'playing', left: 0 }, -1);
  b.grid.classList.add('is-static');
  b.grid.setAttribute('aria-hidden', 'true');
  return b.grid;
}

export function createSumsBoard(
  host: HTMLElement,
  cb: { onStrike(cell: number): void; onMark(cell: number): void },
): SumsBoardHandle {
  const panel = document.createElement('div');
  panel.className = 'sums-panel glass';
  host.appendChild(panel);

  let game: GameState | null = null;
  let built: Built | null = null;
  let interactive = true;
  let paused = false;
  let bad = -1;
  let down = -1;
  let downKind = '';
  let swallow = false;
  let lastTouchAt = -Infinity;
  let longTimer: ReturnType<typeof setTimeout> | undefined;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const later = (fn: () => void, ms: number): void => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  function fit(): void {
    if (!game || !built) return;
    const w = host.clientWidth;
    if (w <= 0) return;
    const n = game.puzzle.size + 1;
    const size = fitCell(n, n, w - 2 * PANEL_PAD, window.innerHeight - PAGE_CHROME, { min: MIN_CELL, max: MAX_CELL });
    built.grid.style.setProperty('--cell', size + 'px');
  }

  /** The digit cell under a client point, by position (pointer capture retargets events), or -1. */
  function cellAt(x: number, y: number): number {
    if (!game || !built) return -1;
    const n = game.puzzle.size;
    const r = built.grid.getBoundingClientRect();
    const track = r.width / (n + 1);
    const hit = cellFromPoint(x, y, { left: r.left + track, top: r.top + track, width: r.width - track, height: r.height - track }, n);
    return hit ? hit.r * n + hit.c : -1;
  }

  function clearPress(): void {
    if (longTimer !== undefined) clearTimeout(longTimer);
    longTimer = undefined;
    down = -1;
    swallow = false;
  }

  const blocked = (): boolean => !interactive || paused || !game;

  function onDown(e: PointerEvent): void {
    if (blocked()) return;
    const touch = e.pointerType === 'touch';
    if (touch) lastTouchAt = Date.now();
    else if (e.button !== 0) return;
    clearPress();
    const cell = cellAt(e.clientX, e.clientY);
    if (cell < 0) return;
    if (!touch) e.preventDefault(); // no text selection or focus drag
    try {
      built!.grid.setPointerCapture?.(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    down = cell;
    downKind = touch ? 'touch' : 'mouse';
    if (touch) {
      longTimer = setTimeout(() => {
        longTimer = undefined;
        if (down < 0 || blocked()) return;
        swallow = true;
        cb.onMark(down);
      }, LONG_PRESS_MS);
    }
  }

  function onMove(e: PointerEvent): void {
    if (down < 0) return;
    if (cellAt(e.clientX, e.clientY) !== down) clearPress();
  }

  function onUp(e: PointerEvent): void {
    if (down < 0) return;
    const cell = down;
    const swallowed = swallow;
    clearPress();
    if (swallowed || blocked()) return;
    if (downKind === 'mouse' && e.button !== 0) return;
    if (cellAt(e.clientX, e.clientY) === cell) cb.onStrike(cell);
  }

  function onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    if (blocked() || Date.now() - lastTouchAt < TOUCH_MENU_GRACE_MS) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (cell >= 0) cb.onMark(cell);
  }

  // Attached to the panel so they survive `setGame` rebuilding the grid.
  panel.addEventListener('pointerdown', onDown);
  panel.addEventListener('pointermove', onMove);
  panel.addEventListener('pointerup', onUp);
  panel.addEventListener('pointercancel', clearPress);
  panel.addEventListener('lostpointercapture', clearPress);
  panel.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('blur', clearPress);
  const stopFit = watchSize(host, fit);

  function render(): void {
    if (game && built) paint(built, game, bad);
  }

  return {
    setGame(s) {
      if (!built || game?.puzzle.size !== s.puzzle.size) {
        panel.textContent = '';
        built = build(s.puzzle.size, true);
        const g = built.grid;
        g.setAttribute('role', 'group');
        g.style.touchAction = 'none';
        g.style.userSelect = 'none';
        g.style.setProperty('-webkit-user-select', 'none');
        g.style.setProperty('-webkit-touch-callout', 'none');
        // jsdom only knows the camel-case accessor for this one; browsers accept both.
        (g.style as unknown as Record<string, string>).webkitTouchCallout = 'none';
        panel.appendChild(g);
      }
      game = s;
      bad = -1;
      clearPress();
      render();
      fit();
    },

    render,

    mistake(cell) {
      clearPress();
      paused = true;
      bad = cell;
      panel.classList.add('is-paused');
      render();
      later(() => {
        bad = -1;
        render();
      }, FLASH_MS);
      return new Promise<void>((resolve) => {
        later(() => {
          paused = false;
          panel.classList.remove('is-paused');
          resolve();
        }, MISTAKE_PAUSE_MS);
      });
    },

    celebrate() {
      if (reducedMotion() || !built) return Promise.resolve();
      panel.classList.add('is-celebrating');
      return new Promise<void>((resolve) => {
        later(() => {
          panel.classList.remove('is-celebrating');
          resolve();
        }, PULSE_MS);
      });
    },

    setInteractive(on) {
      interactive = on;
      panel.classList.toggle('is-locked', !on);
      if (!on) clearPress();
    },

    destroy() {
      clearPress();
      for (const t of timers) clearTimeout(t);
      timers.clear();
      window.removeEventListener('blur', clearPress);
      stopFit();
      host.textContent = '';
    },
  };
}
