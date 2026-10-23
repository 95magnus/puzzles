import { PALETTE } from '../ui/palette';
import { checkRect, invalid } from './game';
import { initialInput, step, type InputEvent, type InputState } from './input';
import type { Clue, GameState, Rect, Shape } from './types';

export type PatchesBoardHandle = {
  /** Full render: a new board or a restored game. */
  setGame(s: GameState): void;
  /** Re-render tiles, invalid classes and cell labels from the current state. */
  render(): void;
  /** Tile pulse in reading order; resolves at once under reduced motion. */
  celebrate(): Promise<void>;
  setInteractive(on: boolean): void;
  destroy(): void;
};

/** Must match `.patches-panel` padding in patches.css. */
const PANEL_PAD = 12;
/** Vertical space for header, subtitle, HUD and panel padding. */
const PAGE_CHROME = 200;
const MIN_CELL = 30;
const MAX_CELL = 56;
const WAVE_STEP_MS = 30;
const GLOW_MS = 360;
const NEUTRAL = '#8a8fa3';
const NS = 'http://www.w3.org/2000/svg';

function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Outline icon in a 24-unit box, drawn in the clue's colour; the shape alone says what the clue wants. */
const ICON: Record<Shape, { x: number; y: number; w: number; h: number }> = {
  square: { x: 5, y: 5, w: 14, h: 14 },
  wide: { x: 2, y: 6.5, w: 20, h: 11 },
  tall: { x: 6.5, y: 2, w: 11, h: 20 },
  any: { x: 5, y: 5, w: 14, h: 14 },
};

function clueEl(clue: Clue): HTMLElement {
  const el = document.createElement('div');
  el.className = 'patches-clue';
  el.dataset.shape = clue.shape;
  el.style.setProperty('--col', PALETTE[clue.color % PALETTE.length]);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const g = ICON[clue.shape];
  const rect = document.createElementNS(NS, 'rect');
  for (const [k, v] of Object.entries({ x: g.x, y: g.y, width: g.w, height: g.h, rx: 2 })) rect.setAttribute(k, String(v));
  if (clue.shape === 'any') rect.setAttribute('stroke-dasharray', '3 2.4');
  svg.appendChild(rect);
  el.appendChild(svg);
  if (clue.area !== undefined) {
    el.dataset.area = String(clue.area);
    const b = document.createElement('b');
    b.textContent = String(clue.area);
    el.appendChild(b);
  }
  return el;
}

function position(el: HTMLElement, x: Rect): void {
  el.style.setProperty('--r', String(x.r));
  el.style.setProperty('--c', String(x.c));
  el.style.setProperty('--w', String(x.w));
  el.style.setProperty('--h', String(x.h));
}

export function createPatchesBoard(
  el: HTMLElement,
  opts: { onAction: (a: { kind: 'tap'; cell: number } | { kind: 'draw'; rect: Rect }) => void },
): PatchesBoardHandle {
  const panel = document.createElement('div');
  panel.className = 'patches-panel glass';
  const grid = document.createElement('div');
  grid.className = 'patches-grid';
  grid.setAttribute('role', 'grid');
  const tilesEl = document.createElement('div');
  tilesEl.className = 'patches-tiles';
  const previewEl = document.createElement('div');
  previewEl.className = 'patches-preview';
  previewEl.hidden = true;
  const label = document.createElement('span');
  label.className = 'patches-preview-label';
  previewEl.appendChild(label);
  panel.appendChild(grid);
  el.appendChild(panel);

  let game: GameState | null = null;
  let cellEls: HTMLElement[] = [];
  let tileEls: HTMLElement[] = [];
  let input: InputState = initialInput;
  /** The pointer driving the current gesture; other pointers are ignored until it ends. */
  let activePointer: number | null = null;
  let interactive = true;
  let glowTimers: ReturnType<typeof setTimeout>[] = [];
  let settleWave: (() => void) | null = null;

  function baseLabel(s: GameState, i: number): string {
    const n = s.puzzle.size;
    let text = `Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}`;
    const clue = s.puzzle.clues.find((k) => k.cell === i);
    if (clue) text += `, clue ${clue.shape}${clue.area === undefined ? '' : ' ' + clue.area}`;
    return text;
  }

  function render(): void {
    const s = game;
    if (!s) return;
    const n = s.puzzle.size;
    const bad = invalid(s);
    while (tileEls.length > s.rects.length) tileEls.pop()!.remove();
    while (tileEls.length < s.rects.length) {
      const t = document.createElement('div');
      t.className = 'patches-tile';
      tilesEl.appendChild(t);
      tileEls.push(t);
    }
    const covered = new Set<number>();
    s.rects.forEach((x, k) => {
      const t = tileEls[k];
      position(t, x);
      const { clue } = checkRect(s.puzzle, x);
      t.style.setProperty('--col', clue === null ? NEUTRAL : PALETTE[s.puzzle.clues[clue].color % PALETTE.length]);
      t.classList.toggle('is-invalid', bad.has(k));
      for (let r = x.r; r < x.r + x.h; r++) for (let c = x.c; c < x.c + x.w; c++) covered.add(r * n + c);
    });
    cellEls.forEach((c, i) => c.setAttribute('aria-label', baseLabel(s, i) + (covered.has(i) ? ', covered' : '')));
  }

  function showPreview(x: Rect | null): void {
    if (!x || !game) {
      previewEl.hidden = true;
      return;
    }
    position(previewEl, x);
    label.textContent = `${x.w}×${x.h}`;
    previewEl.classList.toggle('is-invalid', !checkRect(game.puzzle, x).ok);
    previewEl.classList.toggle('is-below', x.r === 0);
    previewEl.hidden = false;
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
    const r = step(game.puzzle.size, input, e);
    input = r.state;
    const a = r.action;
    if (!a) return;
    if (a.kind === 'preview') showPreview(a.rect);
    else {
      showPreview(null);
      opts.onAction(a);
    }
  }

  /**
   * The cell under the pointer. Off the board it is null, or with `clamp` the nearest edge cell, so a drag
   * that overshoots an edge row or column keeps going and draws up to that edge.
   */
  function cellAt(e: PointerEvent, clamp: boolean): number | null {
    const n = game!.puzzle.size;
    const b = grid.getBoundingClientRect();
    if (b.width <= 0 || b.height <= 0) return null;
    const fx = (e.clientX - b.left) / b.width;
    const fy = (e.clientY - b.top) / b.height;
    if (!clamp && (fx < 0 || fy < 0 || fx >= 1 || fy >= 1)) return null;
    const at = (f: number) => Math.min(n - 1, Math.max(0, Math.floor(f * n)));
    return at(fy) * n + at(fx);
  }

  function endGesture(): void {
    activePointer = null;
    input = initialInput;
  }

  function onPointer(e: PointerEvent): void {
    if (!interactive || !game) return;
    if (e.type === 'pointerdown') {
      // A second finger neither restarts the drag nor taps.
      if (activePointer !== null && e.pointerId !== activePointer) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      const cell = cellAt(e, false);
      if (cell === null) return;
      activePointer = e.pointerId;
      try {
        grid.setPointerCapture?.(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
      showPreview(null); // a restart after a lost pointerup must not keep the old preview
      send({ type: 'down', cell });
      return;
    }
    if (e.pointerId !== activePointer) return;
    if (e.type === 'pointermove') {
      const cell = cellAt(e, true);
      if (cell !== null) send({ type: 'move', cell });
    } else {
      send({ type: 'up' });
      endGesture();
    }
  }

  /** Window blur drops any gesture. */
  function onCancel(): void {
    send({ type: 'cancel' });
    endGesture();
  }

  /** Pointer cancel and lost capture drop only their own pointer's gesture. */
  function onPointerCancel(e: PointerEvent): void {
    if (e.pointerId === activePointer) onCancel();
  }

  const onContextMenu = (e: Event) => e.preventDefault();

  grid.addEventListener('pointerdown', onPointer);
  grid.addEventListener('pointermove', onPointer);
  grid.addEventListener('pointerup', onPointer);
  grid.addEventListener('pointercancel', onPointerCancel);
  grid.addEventListener('lostpointercapture', onPointerCancel);
  panel.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('blur', onCancel);
  window.addEventListener('resize', fit);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  ro?.observe(el);

  function clearGlow(): void {
    for (const t of glowTimers) clearTimeout(t);
    glowTimers = [];
    for (const t of tileEls) t.classList.remove('is-glow');
    const settle = settleWave;
    settleWave = null;
    settle?.();
  }

  return {
    setGame(s) {
      game = s;
      endGesture();
      clearGlow();
      showPreview(null);
      const n = s.puzzle.size;
      cellEls = [];
      tileEls = [];
      tilesEl.textContent = '';
      for (let i = 0; i < n * n; i++) {
        const c = document.createElement('div');
        c.className = 'patches-cell';
        c.dataset.i = String(i);
        c.setAttribute('role', 'gridcell');
        const clue = s.puzzle.clues.find((k) => k.cell === i);
        if (clue) c.appendChild(clueEl(clue));
        cellEls.push(c);
      }
      grid.replaceChildren(...cellEls, tilesEl, previewEl);
      grid.style.setProperty('--n', String(n));
      render();
      fit();
    },

    render,

    celebrate() {
      if (!game || game.rects.length === 0 || reducedMotion()) return Promise.resolve();
      clearGlow();
      const order = game.rects
        .map((x, k) => ({ k, x }))
        .sort((a, b) => a.x.r - b.x.r || a.x.c - b.x.c);
      order.forEach(({ k }, pos) => {
        glowTimers.push(setTimeout(() => tileEls[k]?.classList.add('is-glow'), pos * WAVE_STEP_MS));
      });
      const end = Math.max(0, order.length - 1) * WAVE_STEP_MS + GLOW_MS;
      return new Promise<void>((resolve) => {
        settleWave = resolve;
        glowTimers.push(
          setTimeout(() => {
            settleWave = null;
            resolve();
          }, end),
        );
      });
    },

    setInteractive(on) {
      interactive = on;
      el.classList.toggle('patches-board--locked', !on);
      if (!on) {
        endGesture();
        showPreview(null);
      }
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
