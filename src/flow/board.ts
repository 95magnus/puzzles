import type { Cell, Puzzle } from './types';
import {
  clearPath,
  isPairComplete,
  isSolved,
  pointerDown,
  pointerMove,
  pointerUp,
  stats,
  type GameState,
} from './game';
import { cellFromPoint } from '../ui/grid';
import { GLYPHS, PALETTE } from '../ui/palette';

export type BoardHandle = {
  setState(s: GameState): void;
  setColorblind(on: boolean): void;
  setInteractive(on: boolean): void;
  celebrate(): Promise<void>;
  destroy(): void;
};

type ChangeKind = 'move' | 'gesture-end';

const NS = 'http://www.w3.org/2000/svg';
/** viewBox units per cell; everything scales with the rendered size. */
const CELL = 100;
const STROKE = 0.36 * CELL;
const DOT_R = 0.29 * CELL;
/** stdDeviation ≈ 3 at 56px cells, scaled linearly. */
const GLOW_STD = (3 / 56) * CELL;
const PULSE_MS = 200;
const RIPPLE_MS = 250;
const CELEBRATE_MAX_MS = 600;

let instance = 0;

function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  return e;
}

const same = (a: Cell, b: Cell) => a.r === b.r && a.c === b.c;
const cx = (c: Cell) => c.c * CELL + CELL / 2;
const cy = (c: Cell) => c.r * CELL + CELL / 2;
const colorOf = (p: Puzzle, k: number) => PALETTE[p.pairs[k].color % PALETTE.length];
const sig = (path: Cell[]) => path.map(x => `${x.r},${x.c}`).join(' ');

export function createBoard(
  el: HTMLElement,
  opts: { onChange: (s: GameState, kind: ChangeKind) => void },
): BoardHandle {
  const id = `board-${++instance}`;
  const svg = svgEl('svg', {
    class: 'board-svg',
    role: 'application',
    'aria-roledescription': 'puzzle board',
    'aria-label': 'Puzzle board',
  });
  const status = document.createElement('div');
  status.className = 'sr-only board-status';
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('role', 'status');
  el.classList.add('board', 'glass');
  el.append(svg, status);

  let state: GameState | null = null;
  let builtFor: Puzzle | null = null;
  let colorblind = false;
  let interactive = true;
  let pointerId: number | null = null;
  let hover: Cell | null = null;
  let lastCell: Cell | null = null;
  let raf = 0;
  let destroyed = false;
  let wasComplete: boolean[] = [];
  /** True when the pending render follows a board-handled user gesture (pulses allowed). */
  let userChange = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const pendingCelebrations = new Set<() => void>();

  // Layers, bottom → top
  let gTints!: SVGGElement;
  let gPaths!: SVGGElement;
  let gDots!: SVGGElement;
  let gGlyphs!: SVGGElement;
  let outline!: SVGRectElement;
  let dots: SVGCircleElement[][] = [];
  const lines = new Map<number, SVGPolylineElement>();
  const tints = new Map<number, { sig: string; g: SVGGElement }>();

  function later(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  }

  function build(p: Puzzle) {
    builtFor = p;
    const ext = p.size * CELL;
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${ext} ${ext}`);
    lines.clear();
    tints.clear();
    wasComplete = p.pairs.map(() => false);

    // Halo glow: blurred copy at 45% alpha under the source. userSpaceOnUse so
    // zero-height bboxes (straight paths) still render.
    const defs = svgEl('defs');
    const m = CELL;
    const filter = svgEl('filter', {
      id: `${id}-glow`,
      filterUnits: 'userSpaceOnUse',
      x: -m, y: -m, width: ext + 2 * m, height: ext + 2 * m,
      'color-interpolation-filters': 'sRGB',
    });
    filter.append(
      svgEl('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: GLOW_STD.toFixed(2), result: 'blur' }),
    );
    const transfer = svgEl('feComponentTransfer', { in: 'blur', result: 'halo' });
    transfer.append(svgEl('feFuncA', { type: 'linear', slope: 0.45 }));
    filter.append(transfer);
    const merge = svgEl('feMerge');
    merge.append(svgEl('feMergeNode', { in: 'halo' }), svgEl('feMergeNode', { in: 'SourceGraphic' }));
    filter.append(merge);
    defs.append(filter);
    svg.append(defs);

    svg.append(svgEl('rect', { class: 'board-bg', x: 0, y: 0, width: ext, height: ext, fill: 'transparent' }));

    gTints = svgEl('g', { class: 'board-tints' });
    svg.append(gTints);

    const grid = svgEl('g', { class: 'board-grid', stroke: 'var(--grid-line)' });
    for (let i = 1; i < p.size; i++) {
      const o = i * CELL;
      grid.append(
        svgEl('line', { x1: o, y1: 0, x2: o, y2: ext, 'vector-effect': 'non-scaling-stroke' }),
        svgEl('line', { x1: 0, y1: o, x2: ext, y2: o, 'vector-effect': 'non-scaling-stroke' }),
      );
    }
    svg.append(grid);

    gPaths = svgEl('g', {
      class: 'board-paths',
      fill: 'none',
      'stroke-width': STROKE,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      filter: `url(#${id}-glow)`,
    });
    svg.append(gPaths);

    gDots = svgEl('g', { class: 'board-dots', filter: `url(#${id}-glow)` });
    dots = p.pairs.map((pair, k) =>
      [pair.a, pair.b].map(c => {
        const dot = svgEl('circle', { class: 'board-dot', cx: cx(c), cy: cy(c), r: DOT_R, fill: colorOf(p, k) });
        gDots.append(dot);
        return dot;
      }),
    );
    svg.append(gDots);

    gGlyphs = svgEl('g', { class: 'board-glyphs', 'aria-hidden': 'true' });
    svg.append(gGlyphs);
    renderGlyphs();

    outline = svgEl('rect', {
      class: 'board-outline',
      width: CELL - 8, height: CELL - 8, rx: 14, fill: 'none',
      'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', visibility: 'hidden',
    });
    svg.append(outline);
  }

  function renderGlyphs() {
    if (!builtFor) return;
    gGlyphs.replaceChildren();
    if (!colorblind) return;
    const p = builtFor;
    p.pairs.forEach(pair => {
      for (const c of [pair.a, pair.b]) {
        const t = svgEl('text', {
          class: 'board-glyph',
          x: cx(c), y: cy(c),
          'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-size': Math.round(CELL * 0.3),
        });
        // VS15 forces text (non-emoji) presentation where a glyph has an emoji variant.
        t.textContent = GLYPHS[pair.color % GLYPHS.length] + '︎';
        gGlyphs.append(t);
      }
    });
  }

  function render() {
    raf = 0;
    if (!state || destroyed) return;
    const s = state;
    const fresh = s.puzzle !== builtFor;
    if (fresh) build(s.puzzle);
    const mayPulse = userChange && !fresh;
    userChange = false;
    const p = s.puzzle;

    // Paths: one polyline per non-empty path, kept in color order.
    s.paths.forEach((path, k) => {
      let line = lines.get(k);
      if (path.length === 0) {
        line?.remove();
        lines.delete(k);
        return;
      }
      if (!line) {
        line = svgEl('polyline', { class: 'board-path', stroke: colorOf(p, k) });
        line.dataset.color = String(k);
        lines.set(k, line);
        const after = [...lines.keys()].filter(j => j > k).sort((a, b) => a - b)[0];
        gPaths.insertBefore(line, after === undefined ? null : lines.get(after)!);
      }
      line.setAttribute('points', path.map(c => `${cx(c)},${cy(c)}`).join(' '));
    });

    // Completed-pair tints + one-shot pulse on completion.
    s.paths.forEach((path, k) => {
      const done = isPairComplete(s, k);
      const existing = tints.get(k);
      const key = done ? sig(path) : '';
      if (existing && existing.sig !== key) {
        existing.g.remove();
        tints.delete(k);
      }
      if (done && !tints.has(k)) {
        const g = svgEl('g', { class: 'board-tint', fill: colorOf(p, k) });
        path.forEach(c => g.append(svgEl('rect', { x: c.c * CELL, y: c.r * CELL, width: CELL, height: CELL, 'fill-opacity': '0.12' })));
        gTints.append(g);
        tints.set(k, { sig: key, g });
      }
      if (done && !wasComplete[k] && mayPulse) pulse(k);
      wasComplete[k] = done;
    });

    // Active head (during drag) or hover outline.
    let target: Cell | null = null;
    let stroke = 'rgba(255,255,255,.28)';
    if (s.active !== null && s.paths[s.active].length > 0) {
      const path = s.paths[s.active];
      target = path[path.length - 1];
      stroke = colorOf(p, s.active);
    } else if (interactive && hover) {
      target = hover;
    }
    if (target) {
      outline.setAttribute('x', String(target.c * CELL + 4));
      outline.setAttribute('y', String(target.r * CELL + 4));
      outline.setAttribute('stroke', stroke);
      outline.setAttribute('visibility', 'visible');
    } else {
      outline.setAttribute('visibility', 'hidden');
    }

    svg.style.cursor = interactive && hover && isGrabbable(s, hover) ? 'pointer' : '';
  }

  function pulse(k: number) {
    for (const dot of dots[k] ?? []) {
      dot.classList.remove('board-dot--pulse');
      dot.classList.add('board-dot--pulse');
      later(() => dot.classList.remove('board-dot--pulse'), PULSE_MS);
    }
  }

  function isGrabbable(s: GameState, c: Cell): boolean {
    if (s.active !== null) return true;
    if (s.puzzle.pairs.some(pr => same(pr.a, c) || same(pr.b, c))) return true;
    return s.paths.some(path => path.length > 0 && same(path[path.length - 1], c));
  }

  function scheduleRender() {
    if (raf || destroyed) return;
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(render);
    else render();
  }

  function renderNow() {
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    raf = 0;
    render();
  }

  /** Live-region summary; announced on gesture end / external state, not on every drag step. */
  function announce(s: GameState) {
    const t = stats(s);
    const text = isSolved(s)
      ? 'Puzzle solved'
      : `${t.flowsDone} of ${t.flowsTotal} flows connected, ${t.fillPct}% filled`;
    if (status.textContent !== text) status.textContent = text;
  }

  function commit(next: GameState, kind: ChangeKind) {
    state = next;
    userChange = true;
    if (kind === 'gesture-end') announce(next);
    if (next.active !== null) {
      const path = next.paths[next.active];
      if (path.length) lastCell = path[path.length - 1];
    }
    scheduleRender();
    opts.onChange(next, kind);
  }

  function cellAt(e: MouseEvent): Cell | null {
    if (!state) return null;
    return cellFromPoint(e.clientX, e.clientY, svg.getBoundingClientRect(), state.puzzle.size);
  }

  function endGesture() {
    const id = pointerId;
    pointerId = null;
    if (id !== null) {
      try {
        if (svg.hasPointerCapture?.(id)) svg.releasePointerCapture(id);
      } catch {
        /* capture already gone */
      }
    }
    if (state && state.active !== null) commit(pointerUp(state), 'gesture-end');
  }

  function onPointerDown(e: PointerEvent) {
    if (!interactive || !state || pointerId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const cell = cellAt(e);
    if (!cell) return;
    const next = pointerDown(state, cell);
    if (next === state) return;
    e.preventDefault();
    pointerId = e.pointerId;
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {
      /* not supported: window blur / pointerleave fallback below */
    }
    commit(next, 'move');
  }

  function onPointerMove(e: PointerEvent) {
    if (!state) return;
    const cell = cellAt(e);
    if (pointerId !== null) {
      if (e.pointerId !== pointerId || !cell) return;
      const next = pointerMove(state, cell);
      if (next !== state) commit(next, 'move');
      return;
    }
    if (!interactive) return;
    const changed = (hover === null) !== (cell === null) || (hover && cell && !same(hover, cell));
    hover = cell;
    if (changed) scheduleRender();
  }

  function onPointerEnd(e: PointerEvent) {
    if (pointerId === null || e.pointerId !== pointerId) return;
    endGesture();
  }

  function onPointerLeave(e: PointerEvent) {
    if (hover) {
      hover = null;
      scheduleRender();
    }
    // Without capture (unsupported), leaving the board ends the drag.
    if (pointerId !== null && e.pointerId === pointerId) {
      let captured = false;
      try {
        captured = !!svg.hasPointerCapture?.(pointerId);
      } catch {
        /* ignore */
      }
      if (!captured) endGesture();
    }
  }

  function onContextMenu(e: MouseEvent) {
    e.preventDefault();
    if (!interactive || !state || pointerId !== null) return;
    const cell = cellAt(e);
    if (!cell) return;
    const k = state.paths.findIndex(path => path.some(c => same(c, cell)));
    if (k < 0) return;
    const next = clearPath(state, k);
    if (next !== state) commit(next, 'gesture-end');
  }

  function onBlur() {
    if (pointerId !== null) endGesture();
  }

  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerEnd);
  svg.addEventListener('pointercancel', onPointerEnd);
  svg.addEventListener('lostpointercapture', onPointerEnd);
  svg.addEventListener('pointerleave', onPointerLeave);
  svg.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('blur', onBlur);

  return {
    setState(s) {
      if (destroyed) return;
      if (s.active === null) pointerId = null;
      if (s === state) return;
      if (state && s.puzzle !== state.puzzle) lastCell = null;
      state = s;
      userChange = false; // external state: prime completion flags without pulsing
      renderNow();
      announce(s);
    },
    setColorblind(on) {
      colorblind = on;
      svg.classList.toggle('board-svg--colorblind', on);
      renderGlyphs();
    },
    setInteractive(on) {
      if (interactive === on) return;
      interactive = on;
      el.classList.toggle('board--locked', !on);
      if (!on) {
        hover = null;
        if (pointerId !== null) endGesture();
      }
      scheduleRender();
    },
    celebrate() {
      if (destroyed || !state || reducedMotion()) return Promise.resolve();
      renderNow();
      const s = state;
      const origin = lastCell ?? { r: (s.puzzle.size - 1) / 2, c: (s.puzzle.size - 1) / 2 };
      const dist = (path: Cell[]) =>
        Math.min(...path.map(c => Math.abs(c.r - origin.r) + Math.abs(c.c - origin.c)));
      const ordered = [...lines.entries()]
        .map(([k, line]) => ({ line, d: dist(s.paths[k]) }))
        .sort((a, b) => a.d - b.d)
        .map(x => x.line);
      if (ordered.length === 0) return Promise.resolve();
      const step = ordered.length > 1 ? Math.min(70, (CELEBRATE_MAX_MS - RIPPLE_MS) / (ordered.length - 1)) : 0;
      const total = Math.round(RIPPLE_MS + step * (ordered.length - 1));
      ordered.forEach((line, i) => {
        line.style.animationDelay = `${Math.round(i * step)}ms`;
        line.classList.add('board-path--ripple');
      });
      return new Promise<void>(resolve => {
        pendingCelebrations.add(resolve);
        later(() => {
          pendingCelebrations.delete(resolve);
          ordered.forEach(line => {
            line.classList.remove('board-path--ripple');
            line.style.animationDelay = '';
          });
          resolve();
        }, total);
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      timers.forEach(t => clearTimeout(t));
      timers.clear();
      pendingCelebrations.forEach(r => r());
      pendingCelebrations.clear();
      svg.removeEventListener('pointerdown', onPointerDown);
      svg.removeEventListener('pointermove', onPointerMove);
      svg.removeEventListener('pointerup', onPointerEnd);
      svg.removeEventListener('pointercancel', onPointerEnd);
      svg.removeEventListener('lostpointercapture', onPointerEnd);
      svg.removeEventListener('pointerleave', onPointerLeave);
      svg.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('blur', onBlur);
      svg.remove();
      status.remove();
      el.classList.remove('board', 'glass', 'board--locked');
    },
  };
}
