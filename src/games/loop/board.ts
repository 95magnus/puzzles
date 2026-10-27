import { violations } from './game';
import { geometry } from './geometry';
import { edgeNear, initialInput, step, type InputEvent, type InputState } from './input';
import type { Edge, GameState, PaintMode } from './types';
import { PAGE_CHROME, PANEL_PAD, fitCell, reducedMotion, watchSize } from '../../ui/fit';

export type LoopBoardHandle = {
  /** Full render: a new board or a restored game. */
  setGame(s: GameState): void;
  /** Re-render edges, clues and dots from the current state. */
  render(): void;
  /** A glow runs once around the loop; resolves at once under reduced motion. */
  celebrate(): Promise<void>;
  setInteractive(on: boolean): void;
  destroy(): void;
};

export type LoopBoardCallbacks = {
  onCycle(edge: number): void;
  onCross(edge: number): void;
  onPaint(edges: number[], mode: PaintMode): void;
};

const MIN_CELL = 30;
const MAX_CELL = 60;
const CELEBRATE_MS = 600;
const GLOW_MS = 200;
const DOT_RADIUS = 0.07;
const CROSS_R = 0.12;
const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function clueText(cell: number, size: number, n: number): SVGElement {
  const t = svgEl('text', {
    class: 'loop-clue',
    x: (cell % size) + 0.5,
    y: Math.floor(cell / size) + 0.5,
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
  });
  t.dataset.cell = String(cell);
  t.textContent = String(n);
  return t;
}

function lineEl(edge: number, size: number): SVGElement {
  const [a, b] = geometry(size).edgeDots[edge];
  const w = size + 1;
  return svgEl('line', { x1: a % w, y1: Math.floor(a / w), x2: b % w, y2: Math.floor(b / w) });
}

/** A static, inert board: dots, clues and the given line edges. Used by the how-to and the dashboard card. */
export function loopSvg(size: number, clues: (number | null)[], lines: number[]): SVGSVGElement {
  const svg = svgEl('svg', {
    viewBox: `-0.3 -0.3 ${size + 0.6} ${size + 0.6}`,
    'aria-hidden': 'true',
    class: 'loop-mini',
  }) as SVGSVGElement;
  const dots: SVGElement[] = [];
  for (let r = 0; r <= size; r++) {
    for (let c = 0; c <= size; c++) dots.push(svgEl('circle', { class: 'loop-dot', cx: c, cy: r, r: DOT_RADIUS }));
  }
  const ls = svgEl('g', { class: 'loop-lines' });
  for (const e of lines) ls.append(lineEl(e, size));
  const cs: SVGElement[] = [];
  clues.forEach((n, cell) => {
    if (n !== null) cs.push(clueText(cell, size, n));
  });
  svg.append(...dots, ls, ...cs);
  return svg;
}

export function createLoopBoard(host: HTMLElement, cb: LoopBoardCallbacks): LoopBoardHandle {
  const panel = document.createElement('div');
  panel.className = 'loop-panel glass';
  const svg = svgEl('svg', { class: 'loop-svg', role: 'group', 'aria-label': 'Board' }) as SVGSVGElement;
  svg.style.touchAction = 'none'; // drags draw instead of scrolling, whatever the stylesheet says
  const edgesEl = svgEl('g', { class: 'loop-edges' });
  const dotsEl = svgEl('g', { class: 'loop-dots' });
  const cluesEl = svgEl('g', { class: 'loop-clues' });
  svg.append(edgesEl, dotsEl, cluesEl);
  panel.appendChild(svg);
  host.appendChild(panel);

  let game: GameState | null = null;
  let edgeEls: SVGElement[] = [];
  let dotEls: SVGElement[] = [];
  let clueEls = new Map<number, SVGElement>();
  let input: InputState = initialInput;
  /** The pointer driving the current gesture; other pointers are ignored until it ends. */
  let activePointer: number | null = null;
  let interactive = true;
  /** Edges drawn or erased by the drag in progress, shown without touching the game. */
  let preview: { edges: Set<number>; mode: PaintMode } | null = null;
  let glowTimers: ReturnType<typeof setTimeout>[] = [];
  let settle: (() => void) | null = null;

  function stateOf(e: number): Edge {
    return game!.edges[e];
  }

  function shown(e: number): Edge {
    if (preview?.edges.has(e)) return preview.mode === 'draw' ? 1 : stateOf(e) === 1 ? 0 : stateOf(e);
    return stateOf(e);
  }

  function renderEdges(): void {
    if (!game) return;
    edgeEls.forEach((g, e) => {
      const v = shown(e);
      const name = v === 1 ? 'line' : v === 2 ? 'cross' : 'empty';
      if (g.dataset.state !== name) g.dataset.state = name;
    });
  }

  function render(): void {
    const s = game;
    if (!s) return;
    renderEdges();
    const g = geometry(s.puzzle.size);
    const bad = violations(s);
    s.puzzle.clues.forEach((n, cell) => {
      const el = clueEls.get(cell);
      if (!el || n === null) return;
      const lines = g.cellEdges[cell].filter((e) => s.edges[e] === 1).length;
      el.classList.toggle('is-done', lines === n);
      el.classList.toggle('is-bad', bad.clues.has(cell));
    });
    dotEls.forEach((el, d) => el.classList.toggle('is-bad', bad.dots.has(d)));
  }

  function setPreview(p: typeof preview): void {
    preview = p;
    renderEdges();
  }

  function fit(): void {
    if (!game) return;
    const w = host.clientWidth;
    if (w <= 0) return;
    const units = game.puzzle.size + 1; // the half-cell margin counts
    const size = fitCell(units, units, w - 2 * PANEL_PAD, window.innerHeight - PAGE_CHROME, { min: MIN_CELL, max: MAX_CELL });
    panel.style.setProperty('--cell', size + 'px');
  }

  /** The pointer in dot units; off-board points pass through unclamped. */
  function point(e: MouseEvent): { x: number; y: number } | null {
    const units = game!.puzzle.size + 1;
    const b = svg.getBoundingClientRect();
    if (b.width <= 0 || b.height <= 0) return null;
    return { x: ((e.clientX - b.left) / b.width) * units - 0.5, y: ((e.clientY - b.top) / b.height) * units - 0.5 };
  }

  function send(ev: InputEvent): void {
    if (!game) return;
    const r = step(game.puzzle.size, stateOf, input, ev);
    input = r.state;
    for (const a of r.actions) {
      if (a.kind === 'preview') setPreview({ edges: new Set(a.edges), mode: a.mode });
      else if (a.kind === 'paint') {
        setPreview(null);
        cb.onPaint(a.edges, a.mode);
      } else cb.onCycle(a.edge);
    }
  }

  function endGesture(): void {
    activePointer = null;
    input = initialInput;
  }

  function onPointer(e: PointerEvent): void {
    if (!interactive || !game) return;
    if (e.type === 'pointerdown') {
      // A second finger neither restarts the gesture nor taps.
      if (activePointer !== null && e.pointerId !== activePointer) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const at = point(e);
      if (!at) return;
      e.preventDefault();
      activePointer = e.pointerId;
      try {
        svg.setPointerCapture?.(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
      setPreview(null);
      input = initialInput;
      send({ type: 'down', ...at });
      return;
    }
    if (e.pointerId !== activePointer) return;
    if (e.type === 'pointermove') {
      const at = point(e);
      if (at) send({ type: 'move', ...at });
    } else {
      send({ type: 'up' });
      endGesture();
    }
  }

  /** Window blur and pointer cancel commit what the gesture has painted so far, then drop it. */
  function onCancel(): void {
    send({ type: 'cancel' });
    setPreview(null);
    endGesture();
  }

  function onPointerCancel(e: PointerEvent): void {
    if (e.pointerId === activePointer) onCancel();
  }

  /** Right-click (or a touch long-press) marks the edge under the point with an ✕; the browser menu never opens. */
  function onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    if (!interactive || !game) return;
    if (activePointer !== null) {
      // Drop the gesture uncommitted so its pointerup does not also tap.
      endGesture();
      setPreview(null);
    }
    const at = point(e);
    if (!at) return;
    const edge = edgeNear(game.puzzle.size, at.x, at.y);
    if (edge >= 0) cb.onCross(edge);
  }

  svg.addEventListener('pointerdown', onPointer);
  svg.addEventListener('pointermove', onPointer);
  svg.addEventListener('pointerup', onPointer);
  svg.addEventListener('pointercancel', onPointerCancel);
  svg.addEventListener('lostpointercapture', onPointerCancel);
  panel.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('blur', onCancel);
  const stopFit = watchSize(host, fit);

  function clearGlow(): void {
    for (const t of glowTimers) clearTimeout(t);
    glowTimers = [];
    for (const g of edgeEls) g.classList.remove('is-glow');
    const done = settle;
    settle = null;
    done?.();
  }

  /** The line edges in order around the loop, from the lowest-numbered one. */
  function loopOrder(s: GameState): number[] {
    const g = geometry(s.puzzle.size);
    const start = s.edges.indexOf(1);
    if (start < 0) return [];
    const order = [start];
    const seen = new Set(order);
    let dot = g.edgeDots[start][1];
    for (;;) {
      const next = g.dotEdges[dot].find((e) => s.edges[e] === 1 && !seen.has(e));
      if (next === undefined) break;
      order.push(next);
      seen.add(next);
      const [a, b] = g.edgeDots[next];
      dot = a === dot ? b : a;
    }
    return order;
  }

  return {
    setGame(s) {
      game = s;
      endGesture();
      clearGlow();
      preview = null;
      const n = s.puzzle.size;
      const g = geometry(n);
      svg.setAttribute('viewBox', `-0.5 -0.5 ${n + 1} ${n + 1}`);
      panel.style.setProperty('--n', String(n + 1));
      edgeEls = g.mid.map((m, e) => {
        const el = svgEl('g', { class: 'loop-edge' });
        el.dataset.edge = String(e);
        el.dataset.state = 'empty';
        el.append(
          lineEl(e, n),
          svgEl('line', { class: 'loop-x', x1: m.x - CROSS_R, y1: m.y - CROSS_R, x2: m.x + CROSS_R, y2: m.y + CROSS_R }),
          svgEl('line', { class: 'loop-x', x1: m.x - CROSS_R, y1: m.y + CROSS_R, x2: m.x + CROSS_R, y2: m.y - CROSS_R }),
        );
        return el;
      });
      edgesEl.replaceChildren(...edgeEls);
      dotEls = Array.from({ length: g.dotCount }, (_, d) => {
        const el = svgEl('circle', { class: 'loop-dot', cx: d % (n + 1), cy: Math.floor(d / (n + 1)), r: DOT_RADIUS });
        el.dataset.dot = String(d);
        return el;
      });
      dotsEl.replaceChildren(...dotEls);
      clueEls = new Map();
      s.puzzle.clues.forEach((c, cell) => {
        if (c !== null) clueEls.set(cell, clueText(cell, n, c));
      });
      cluesEl.replaceChildren(...clueEls.values());
      render();
      fit();
    },

    render,

    celebrate() {
      if (!game || reducedMotion()) return Promise.resolve();
      clearGlow();
      const order = loopOrder(game);
      if (order.length === 0) return Promise.resolve();
      // The glow starts on the last edge by CELEBRATE_MS - GLOW_MS and finishes at CELEBRATE_MS.
      const stagger = (CELEBRATE_MS - GLOW_MS) / order.length;
      order.forEach((e, i) => {
        glowTimers.push(setTimeout(() => edgeEls[e]?.classList.add('is-glow'), i * stagger));
      });
      return new Promise<void>((resolve) => {
        settle = resolve;
        glowTimers.push(
          setTimeout(() => {
            settle = null;
            resolve();
          }, CELEBRATE_MS),
        );
      });
    },

    setInteractive(on) {
      interactive = on;
      host.classList.toggle('loop-board--locked', !on);
      if (!on) {
        endGesture();
        setPreview(null);
      }
    },

    destroy() {
      clearGlow();
      window.removeEventListener('blur', onCancel);
      stopFit();
      host.textContent = '';
    },
  };
}
