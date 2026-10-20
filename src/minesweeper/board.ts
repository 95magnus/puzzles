import { neighbours } from './generate';
import { initialInput, step, type InputAction, type InputEvent, type InputState, type Preview } from './input';
import type { GameState } from './types';

export type BoardHandle = {
  /** Full render: a new board or a restored game. */
  setGame(s: GameState): void;
  /** Diff-update the given cells; ripple outward from `origin` when given. */
  update(changed: number[], origin?: number): void;
  setInteractive(on: boolean): void;
  destroy(): void;
};

const LONG_PRESS_MS = 350;
const RIPPLE_MAX_MS = 300;
const RIPPLE_STEP_MS = 18;
/** Must match `.mines-panel` padding and `.mines-grid` gap in mines.css. */
const PANEL_PAD = 12;
const GAP = 2;
/** Vertical space for header, subtitle, HUD and panel padding, so Expert+ fits 1280×720. */
const PAGE_CHROME = 200;
const MIN_CELL = 20;
const MAX_CELL = 32;

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function createBoard(el: HTMLElement, opts: { onAction: (a: InputAction) => void }): BoardHandle {
  const panel = document.createElement('div');
  panel.className = 'mines-panel glass';
  const grid = document.createElement('div');
  grid.className = 'mines-grid';
  grid.setAttribute('role', 'grid');
  panel.appendChild(grid);
  el.appendChild(panel);

  let game: GameState | null = null;
  let cellEls: HTMLElement[] = [];
  let input: InputState = initialInput;
  let pressed = new Set<number>();
  let interactive = true;
  let lastStatus: GameState['status'] = 'playing';
  let longTimer: ReturnType<typeof setTimeout> | undefined;

  function render(i: number): void {
    const s = game!;
    const { board } = s;
    const v = s.cells[i];
    const lost = s.status === 'lost';
    const mine = board.mines[i] === 1;
    const cls = ['mines-cell'];
    let text = '';
    if (v === 2) {
      cls.push('is-hidden', 'is-flagged');
      if (lost && !mine) cls.push('is-wrong-flag');
    } else if (v === 1 || (lost && mine)) {
      cls.push('is-revealed');
      if (mine) {
        cls.push('is-mine');
        if (i === s.explodedAt) cls.push('is-exploded');
      } else if (board.adj[i] > 0) {
        cls.push('n' + board.adj[i]);
        text = String(board.adj[i]);
      }
    } else {
      cls.push('is-hidden');
    }
    if (pressed.has(i)) cls.push('is-pressed');
    const c = cellEls[i];
    c.className = cls.join(' ');
    if (c.textContent !== text) c.textContent = text;
  }

  function fit(): void {
    if (!game) return;
    const w = el.clientWidth;
    if (w <= 0) return;
    const { cols, rows } = game.board;
    const byWidth = (w - 2 * PANEL_PAD - (cols - 1) * GAP) / cols;
    const byHeight = (window.innerHeight - PAGE_CHROME - (rows - 1) * GAP) / rows;
    const size = Math.floor(Math.min(byWidth, byHeight));
    grid.style.setProperty('--cell', Math.min(MAX_CELL, Math.max(MIN_CELL, size)) + 'px');
  }

  function previewCells(p: Preview): Set<number> {
    const out = new Set<number>();
    if (!p || !game) return out;
    const { cells, board } = game;
    if (!p.chord) {
      if (cells[p.cell] === 0) out.add(p.cell);
      return out;
    }
    if (cells[p.cell] !== 2) out.add(p.cell);
    for (const j of neighbours(board.cols, board.rows, p.cell)) if (cells[j] === 0) out.add(j);
    return out;
  }

  function applyPreview(p: Preview): void {
    const next = previewCells(p);
    const old = pressed;
    pressed = next;
    for (const i of old) if (!next.has(i)) render(i);
    for (const i of next) if (!old.has(i)) render(i);
  }

  function clearLongPress(): void {
    if (longTimer !== undefined) clearTimeout(longTimer);
    longTimer = undefined;
  }

  function send(e: InputEvent): void {
    if (!interactive || !game) return;
    const r = step(input, e);
    input = r.state;
    if (input.mode !== 'touch' || input.longFired) clearLongPress();
    applyPreview(r.preview);
    if (r.action) opts.onAction(r.action);
  }

  function cellAt(e: PointerEvent): number {
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const c = hit instanceof HTMLElement ? hit.closest<HTMLElement>('[data-i]') : null;
    return c && grid.contains(c) ? Number(c.dataset.i) : -1;
  }

  function onPointer(e: PointerEvent): void {
    const type = e.type === 'pointerdown' ? 'down' : e.type === 'pointerup' ? 'up' : 'move';
    const pointer = e.pointerType === 'touch' ? 'touch' : 'mouse';
    if (!interactive) return;
    if (type === 'down') {
      if (pointer === 'mouse') e.preventDefault(); // no text selection / focus drag
      try {
        grid.setPointerCapture?.(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
    }
    send({ type, pointer, buttons: e.buttons, cell: cellAt(e) });
    if (type === 'down' && pointer === 'touch' && input.mode === 'touch') {
      clearLongPress();
      longTimer = setTimeout(() => {
        longTimer = undefined;
        send({ type: 'longpress' });
      }, LONG_PRESS_MS);
    }
  }

  function onCancel(): void {
    clearLongPress();
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

  function resetInput(): void {
    clearLongPress();
    input = initialInput;
    applyPreview(null);
  }

  return {
    setGame(s) {
      game = s;
      lastStatus = s.status;
      pressed = new Set();
      input = initialInput;
      const n = s.cells.length;
      if (cellEls.length !== n) {
        grid.textContent = '';
        cellEls = [];
        for (let i = 0; i < n; i++) {
          const c = document.createElement('div');
          c.dataset.i = String(i);
          grid.appendChild(c);
          cellEls.push(c);
        }
      }
      grid.style.gridTemplateColumns = `repeat(${s.board.cols}, var(--cell))`;
      for (let i = 0; i < n; i++) {
        cellEls[i].style.transitionDelay = '';
        render(i);
      }
      fit();
    },

    update(changed, origin) {
      if (!game) return;
      if (game.status !== lastStatus) {
        // Win or loss reveals more than the changed cells (mines, wrong flags).
        lastStatus = game.status;
        resetInput();
        for (let i = 0; i < cellEls.length; i++) render(i);
      }
      const ripple = origin !== undefined && origin >= 0 && !reducedMotion();
      const { cols } = game.board;
      for (const i of changed) {
        let delay = 0;
        if (ripple) {
          const d = Math.max(Math.abs(Math.floor(i / cols) - Math.floor(origin / cols)), Math.abs((i % cols) - (origin % cols)));
          delay = Math.min(RIPPLE_MAX_MS, d * RIPPLE_STEP_MS);
        }
        cellEls[i].style.transitionDelay = delay ? delay + 'ms' : '';
        render(i);
      }
    },

    setInteractive(on) {
      interactive = on;
      el.classList.toggle('mines-board--locked', !on);
      if (!on) resetInput();
    },

    destroy() {
      clearLongPress();
      window.removeEventListener('blur', onCancel);
      window.removeEventListener('resize', fit);
      ro?.disconnect();
      el.textContent = '';
    },
  };
}
