import { cellFromPoint } from '../ui/board';
import { PALETTE } from '../ui/palette';
import { conflicts } from './game';
import { initialInput, step, type InputAction, type InputEvent, type InputState } from './input';
import type { GameState, Puzzle } from './types';

export type QueensBoardHandle = {
  /** Full render: a new board or a restored game. */
  setGame(s: GameState): void;
  /** Re-render the given cells, then refresh conflict classes on every queen. */
  update(changed: number[]): void;
  /** Win glow wave; resolves at once under reduced motion. */
  celebrate(): Promise<void>;
  setInteractive(on: boolean): void;
  destroy(): void;
};

/** Must match `.queens-panel` padding in queens.css. */
const PANEL_PAD = 12;
/** Vertical space for header, subtitle, HUD and panel padding. */
const PAGE_CHROME = 200;
const MIN_CELL = 32;
const MAX_CELL = 56;
const WAVE_STEP_MS = 40;
const GLOW_MS = 360;

function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** True on each side where the neighbour is in another region or off the board. */
export function regionEdges(p: Puzzle, cell: number): { t: boolean; r: boolean; b: boolean; l: boolean } {
  const n = p.size;
  const r = Math.floor(cell / n);
  const c = cell % n;
  const reg = p.regions[cell];
  return {
    t: r === 0 || p.regions[cell - n] !== reg,
    r: c === n - 1 || p.regions[cell + 1] !== reg,
    b: r === n - 1 || p.regions[cell + n] !== reg,
    l: c === 0 || p.regions[cell - 1] !== reg,
  };
}

const LABELS = ['empty', 'marked', 'queen'];

export function createQueensBoard(el: HTMLElement, opts: { onAction: (a: InputAction) => void }): QueensBoardHandle {
  const panel = document.createElement('div');
  panel.className = 'queens-panel glass';
  const grid = document.createElement('div');
  grid.className = 'queens-grid';
  grid.setAttribute('role', 'grid');
  panel.appendChild(grid);
  el.appendChild(panel);

  let game: GameState | null = null;
  let cellEls: HTMLElement[] = [];
  let input: InputState = initialInput;
  let interactive = true;
  let bad = new Set<number>();
  let glowTimers: ReturnType<typeof setTimeout>[] = [];
  let settleWave: (() => void) | null = null;

  function render(i: number): void {
    const s = game!;
    const v = s.cells[i];
    const n = s.puzzle.size;
    const e = regionEdges(s.puzzle, i);
    const r = Math.floor(i / n);
    const c0 = i % n;
    const c = cellEls[i];
    const cls = ['queens-cell'];
    if (e.t) cls.push('e-t');
    if (e.r) cls.push('e-r');
    if (e.b) cls.push('e-b');
    if (e.l) cls.push('e-l');
    if (r === 0) cls.push('o-t');
    if (c0 === n - 1) cls.push('o-r');
    if (r === n - 1) cls.push('o-b');
    if (c0 === 0) cls.push('o-l');
    if (v === 1) cls.push('is-mark');
    if (v === 2) cls.push('is-queen');
    if (bad.has(i)) cls.push('is-conflict');
    if (c.classList.contains('is-glow')) cls.push('is-glow');
    c.className = cls.join(' ');
    const text = v === 1 ? '✕' : v === 2 ? '♛' : '';
    if (c.textContent !== text) c.textContent = text;
    c.setAttribute('aria-label', `Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}, ${LABELS[v]}`);
  }

  function refreshConflicts(): void {
    const next = conflicts(game!);
    const old = bad;
    bad = next;
    for (const i of old) if (!next.has(i)) render(i);
    for (const i of next) if (!old.has(i)) render(i);
  }

  function fit(): void {
    if (!game) return;
    const w = el.clientWidth;
    if (w <= 0) return;
    const n = game.puzzle.size;
    const byWidth = (w - 2 * PANEL_PAD) / n;
    const byHeight = (window.innerHeight - PAGE_CHROME) / n;
    const size = Math.floor(Math.min(byWidth, byHeight));
    grid.style.setProperty('--cell', Math.min(MAX_CELL, Math.max(MIN_CELL, size)) + 'px');
  }

  function send(e: InputEvent): void {
    if (!interactive || !game) return;
    const r = step(input, e);
    input = r.state;
    if (r.action) opts.onAction(r.action);
  }

  function cellAt(e: PointerEvent): number | null {
    const n = game!.puzzle.size;
    const hit = cellFromPoint(e.clientX, e.clientY, grid.getBoundingClientRect(), n);
    return hit ? hit.r * n + hit.c : null;
  }

  function onPointer(e: PointerEvent): void {
    if (!interactive || !game) return;
    if (e.type === 'pointerdown') {
      e.preventDefault();
      try {
        grid.setPointerCapture?.(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
      const cell = cellAt(e);
      if (cell === null) return;
      send({ type: 'down', cell, mark: game.cells[cell] as 0 | 1 | 2 });
    } else if (e.type === 'pointermove') {
      send({ type: 'move', cell: cellAt(e) });
    } else {
      send({ type: 'up' });
    }
  }

  function onCancel(): void {
    send({ type: 'cancel' });
  }

  const onContextMenu = (e: Event) => e.preventDefault();

  grid.addEventListener('pointerdown', onPointer);
  grid.addEventListener('pointermove', onPointer);
  grid.addEventListener('pointerup', onPointer);
  grid.addEventListener('pointercancel', onCancel);
  grid.addEventListener('lostpointercapture', onCancel);
  panel.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('blur', onCancel);
  window.addEventListener('resize', fit);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  ro?.observe(el);

  function clearGlow(): void {
    for (const t of glowTimers) clearTimeout(t);
    glowTimers = [];
    for (const c of cellEls) c.classList.remove('is-glow');
    const settle = settleWave;
    settleWave = null;
    settle?.();
  }

  return {
    setGame(s) {
      game = s;
      input = initialInput;
      clearGlow();
      const n = s.puzzle.size;
      const total = n * n;
      grid.textContent = '';
      cellEls = [];
      for (let i = 0; i < total; i++) {
        const c = document.createElement('div');
        c.dataset.i = String(i);
        c.setAttribute('role', 'gridcell');
        c.style.setProperty('--c', PALETTE[s.puzzle.regions[i]]);
        grid.appendChild(c);
        cellEls.push(c);
      }
      grid.style.setProperty('--n', String(n));
      bad = conflicts(s);
      for (let i = 0; i < total; i++) render(i);
      fit();
    },

    update(changed) {
      if (!game) return;
      for (const i of changed) render(i);
      refreshConflicts();
    },

    celebrate() {
      if (!game || reducedMotion()) return Promise.resolve();
      const s = game;
      const n = s.puzzle.size;
      clearGlow();
      let last = 0;
      for (let i = 0; i < cellEls.length; i++) {
        if (s.cells[i] !== 2) continue;
        const delay = Math.floor(i / n) * WAVE_STEP_MS;
        last = Math.max(last, delay);
        glowTimers.push(setTimeout(() => cellEls[i].classList.add('is-glow'), delay));
      }
      return new Promise<void>((resolve) => {
        settleWave = resolve;
        glowTimers.push(
          setTimeout(() => {
            settleWave = null;
            resolve();
          }, last + GLOW_MS),
        );
      });
    },

    setInteractive(on) {
      interactive = on;
      el.classList.toggle('queens-board--locked', !on);
      if (!on) input = initialInput;
    },

    destroy() {
      clearGlow();
      window.removeEventListener('blur', onCancel);
      window.removeEventListener('resize', fit);
      ro?.disconnect();
      el.textContent = '';
    },
  };
}
