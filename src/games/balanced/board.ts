import { isGiven, violations } from './game';
import { lineCells } from './lines';
import type { GameState, Sym } from './types';
import { PAGE_CHROME, PANEL_PAD, fitCell, reducedMotion, watchSize } from '../../ui/fit';

export type BalancedBoardHandle = {
  /** Full render: a new board or a restored game. */
  setGame(s: GameState): void;
  /** Re-render glyphs, labels and violation classes from the current state. */
  render(): void;
  /** Cell pulse in reading order; resolves at once under reduced motion. */
  celebrate(): Promise<void>;
  setInteractive(on: boolean): void;
  destroy(): void;
};

const MIN_CELL = 30;
const MAX_CELL = 56;
const WAVE_STEP_MS = 20;
const GLOW_MS = 360;
const NS = 'http://www.w3.org/2000/svg';
const NAMES = ['empty', 'dot', 'ring'] as const;

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** A filled dot or a hollow ring in a 24-unit box, each in its own colour; the how-to reuses it. */
export function symbolSvg(sym: 1 | 2): SVGSVGElement {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }) as SVGSVGElement;
  svg.classList.add(sym === 1 ? 'balanced-dot' : 'balanced-ring');
  svg.appendChild(sym === 1 ? svgEl('circle', { cx: 12, cy: 12, r: 7 }) : svgEl('circle', { cx: 12, cy: 12, r: 6 }));
  return svg;
}

export function createBalancedBoard(
  el: HTMLElement,
  opts: { onTap: (cell: number) => void; onRing: (cell: number) => void },
): BalancedBoardHandle {
  const panel = document.createElement('div');
  panel.className = 'balanced-panel glass';
  const grid = document.createElement('div');
  grid.className = 'balanced-grid';
  grid.setAttribute('role', 'grid');
  const edgesEl = document.createElement('div');
  edgesEl.className = 'balanced-edges';
  const runsEl = document.createElement('div');
  runsEl.className = 'balanced-runs';
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
    runsEl.replaceChildren(...runsOf(s).map(runEl));
  }

  /** Maximal runs of three or more equal symbols, as one capsule each. */
  function runsOf(s: GameState): { cell: number; vertical: boolean; len: number }[] {
    const n = s.puzzle.size;
    const out: { cell: number; vertical: boolean; len: number }[] = [];
    for (let line = 0; line < 2 * n; line++) {
      const cells = lineCells(n, line);
      let k = 0;
      while (k < n) {
        let j = k + 1;
        while (j < n && s.cells[cells[j]] === s.cells[cells[k]]) j++;
        if (s.cells[cells[k]] !== 0 && j - k >= 3) out.push({ cell: cells[k], vertical: line >= n, len: j - k });
        k = j;
      }
    }
    return out;
  }

  function runEl(run: { cell: number; vertical: boolean; len: number }): HTMLElement {
    const n = game!.puzzle.size;
    const e = document.createElement('div');
    e.className = 'balanced-run ' + (run.vertical ? 'is-v' : 'is-h');
    e.style.setProperty('--r', String(Math.floor(run.cell / n)));
    e.style.setProperty('--c', String(run.cell % n));
    e.style.setProperty('--len', String(run.len));
    return e;
  }

  function fit(): void {
    if (!game) return;
    const w = el.clientWidth;
    if (w <= 0) return;
    const n = game.puzzle.size;
    const size = fitCell(n, n, w - 2 * PANEL_PAD, window.innerHeight - PAGE_CHROME, { min: MIN_CELL, max: MAX_CELL });
    grid.style.setProperty('--cell', size + 'px');
  }

  /** The non-given cell under a mouse event, or null. */
  function openCellOf(e: MouseEvent): number | null {
    if (!interactive || !game) return null;
    const c = (e.target as Element).closest<HTMLElement>('.balanced-cell');
    if (!c || !grid.contains(c)) return null;
    const i = Number(c.dataset.i);
    return isGiven(game, i) ? null : i;
  }

  function onClick(e: MouseEvent): void {
    const i = openCellOf(e);
    if (i !== null) opts.onTap(i);
  }

  /** Right-click places a ring; the browser menu never opens over the board. */
  function onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const i = openCellOf(e);
    if (i !== null) opts.onRing(i);
  }

  grid.addEventListener('click', onClick);
  grid.addEventListener('contextmenu', onContextMenu);
  const stopFit = watchSize(el, fit);

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
        c.className = 'balanced-cell';
        c.dataset.i = String(i);
        c.setAttribute('role', 'gridcell');
        c.classList.toggle('is-given', isGiven(s, i));
        cellEls.push(c);
        shown.push(-1 as Sym);
      }
      edgeEls = s.puzzle.edges.map((e) => {
        const b = document.createElement('div');
        b.className = 'balanced-edge ' + (e.b === e.a + 1 ? 'is-h' : 'is-v');
        b.dataset.edge = `${e.a}-${e.b}`;
        b.dataset.kind = e.kind;
        b.textContent = e.kind === 'eq' ? '=' : '×';
        b.style.setProperty('--r', String(Math.floor(e.a / n)));
        b.style.setProperty('--c', String(e.a % n));
        return b;
      });
      edgesEl.replaceChildren(...edgeEls);
      grid.replaceChildren(...cellEls, runsEl, edgesEl);
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
      el.classList.toggle('balanced-board--locked', !on);
    },

    destroy() {
      clearGlow();
      grid.removeEventListener('click', onClick);
      grid.removeEventListener('contextmenu', onContextMenu);
      stopFit();
      el.textContent = '';
    },
  };
}
