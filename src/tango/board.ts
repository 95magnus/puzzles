import { isGiven, violations } from './game';
import { lineCells } from './lines';
import type { GameState, Sym } from './types';

export type TangoBoardHandle = {
  /** Full render: a new board or a restored game. */
  setGame(s: GameState): void;
  /** Re-render glyphs, labels and violation classes from the current state. */
  render(): void;
  /** Cell pulse in reading order; resolves at once under reduced motion. */
  celebrate(): Promise<void>;
  setInteractive(on: boolean): void;
  destroy(): void;
};

/** Must match `.tango-panel` padding in tango.css. */
const PANEL_PAD = 12;
/** Vertical space for header, subtitle, HUD and panel padding. */
const PAGE_CHROME = 200;
const MIN_CELL = 30;
const MAX_CELL = 56;
const WAVE_STEP_MS = 20;
const GLOW_MS = 360;
const NS = 'http://www.w3.org/2000/svg';
const NAMES = ['empty', 'sun', 'moon'] as const;

function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** A sun (disc with rays) or moon (crescent) in a 24-unit box; the how-to and dashboard preview reuse it. */
export function symbolSvg(sym: 1 | 2): SVGSVGElement {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }) as SVGSVGElement;
  svg.classList.add(sym === 1 ? 'tango-sun' : 'tango-moon');
  if (sym === 1) {
    svg.appendChild(svgEl('circle', { cx: 12, cy: 12, r: 5.2 }));
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const p = (r: number) => [12 + r * Math.cos(a), 12 + r * Math.sin(a)].map((v) => v.toFixed(2));
      const [x1, y1] = p(7.6);
      const [x2, y2] = p(10.4);
      svg.appendChild(svgEl('line', { x1, y1, x2, y2 }));
    }
  } else {
    svg.appendChild(svgEl('path', { d: 'M15.5 3.6a8.6 8.6 0 1 0 4.9 14.6A7 7 0 0 1 15.5 3.6z' }));
  }
  return svg;
}

export function createTangoBoard(
  el: HTMLElement,
  opts: { onTap: (cell: number) => void; onMoon: (cell: number) => void },
): TangoBoardHandle {
  const panel = document.createElement('div');
  panel.className = 'tango-panel glass';
  const grid = document.createElement('div');
  grid.className = 'tango-grid';
  grid.setAttribute('role', 'grid');
  const edgesEl = document.createElement('div');
  edgesEl.className = 'tango-edges';
  panel.appendChild(grid);
  el.appendChild(panel);

  let game: GameState | null = null;
  let cellEls: HTMLButtonElement[] = [];
  let edgeEls: HTMLElement[] = [];
  let shown: Sym[] = [];
  let interactive = true;
  let glowTimers: ReturnType<typeof setTimeout>[] = [];
  let settleWave: (() => void) | null = null;

  function label(s: GameState, i: number): string {
    const n = s.puzzle.size;
    const given = isGiven(s, i) ? ', given' : '';
    return `Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}, ${NAMES[s.cells[i]]}${given}`;
  }

  function render(): void {
    const s = game;
    if (!s) return;
    const n = s.puzzle.size;
    s.cells.forEach((v, i) => {
      const c = cellEls[i];
      if (shown[i] !== v) {
        shown[i] = v;
        c.dataset.sym = String(v);
        c.replaceChildren(...(v === 0 ? [] : [symbolSvg(v)]));
      }
      c.setAttribute('aria-label', label(s, i));
    });
    const bad = violations(s);
    const inBadLine = new Set<number>();
    for (const line of bad.lines) for (const c of lineCells(n, line)) inBadLine.add(c);
    cellEls.forEach((c, i) => {
      c.classList.toggle('is-triple', bad.triples.has(i));
      c.classList.toggle('in-bad-line', inBadLine.has(i));
    });
    edgeEls.forEach((e, i) => e.classList.toggle('is-broken', bad.edges.has(i)));
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

  /** The non-given cell under a mouse event, or null. */
  function openCellOf(e: MouseEvent): number | null {
    if (!interactive || !game) return null;
    const c = (e.target as Element).closest<HTMLElement>('.tango-cell');
    if (!c || !grid.contains(c)) return null;
    const i = Number(c.dataset.i);
    return isGiven(game, i) ? null : i;
  }

  function onClick(e: MouseEvent): void {
    const i = openCellOf(e);
    if (i !== null) opts.onTap(i);
  }

  /** Right-click places a moon; the browser menu never opens over the board. */
  function onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const i = openCellOf(e);
    if (i !== null) opts.onMoon(i);
  }

  grid.addEventListener('click', onClick);
  grid.addEventListener('contextmenu', onContextMenu);
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
      clearGlow();
      const n = s.puzzle.size;
      cellEls = [];
      shown = [];
      for (let i = 0; i < n * n; i++) {
        const c = document.createElement('button');
        c.type = 'button';
        c.className = 'tango-cell';
        c.dataset.i = String(i);
        c.setAttribute('role', 'gridcell');
        c.classList.toggle('is-given', isGiven(s, i));
        cellEls.push(c);
        shown.push(-1 as Sym);
      }
      edgeEls = s.puzzle.edges.map((e) => {
        const b = document.createElement('div');
        b.className = 'tango-edge ' + (e.b === e.a + 1 ? 'is-h' : 'is-v');
        b.dataset.edge = `${e.a}-${e.b}`;
        b.dataset.kind = e.kind;
        b.textContent = e.kind === 'eq' ? '=' : '×';
        b.style.setProperty('--r', String(Math.floor(e.a / n)));
        b.style.setProperty('--c', String(e.a % n));
        return b;
      });
      edgesEl.replaceChildren(...edgeEls);
      grid.replaceChildren(...cellEls, edgesEl);
      grid.style.setProperty('--n', String(n));
      render();
      fit();
    },

    render,

    celebrate() {
      if (!game || reducedMotion()) return Promise.resolve();
      clearGlow();
      cellEls.forEach((c, pos) => {
        glowTimers.push(setTimeout(() => c.classList.add('is-glow'), pos * WAVE_STEP_MS));
      });
      const end = Math.max(0, cellEls.length - 1) * WAVE_STEP_MS + GLOW_MS;
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
      el.classList.toggle('tango-board--locked', !on);
    },

    destroy() {
      clearGlow();
      grid.removeEventListener('click', onClick);
      grid.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('resize', fit);
      ro?.disconnect();
      el.textContent = '';
    },
  };
}
