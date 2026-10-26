import { islandTotals, violations } from './game';
import { initialInput, linkNear, step, type InputEvent, type InputState } from './input';
import type { GameState, Puzzle } from './types';

export type BridgesBoardHandle = {
  /** Full render: a new board or a restored game. */
  setGame(s: GameState): void;
  /** Re-render bridge counts and island classes from the current state. */
  render(): void;
  /** The links that refused a crossing bridge flash red. */
  flashBlocked(links: number[]): void;
  /** Bridges pulse breadth-first from island 0; resolves at once under reduced motion. */
  celebrate(): Promise<void>;
  setInteractive(on: boolean): void;
  destroy(): void;
};

/** Must match `.bridges-panel` padding in bridges.css. */
const PANEL_PAD = 12;
/** Vertical space for header, subtitle, HUD and panel padding. */
const PAGE_CHROME = 200;
const MIN_CELL = 28;
const MAX_CELL = 56;
const ISLAND_R = 0.35;
/** Half the gap between the two lines of a double bridge, in cell units: 0.22 cell apart (≈ 12 px at 56 px, ≈ 6 px at 28 px). */
const DOUBLE_OFFSET = 0.11;
const BLOCKED_MS = 300;
const WAVE_STEP_MS = 40;
const GLOW_MS = 360;
const NS = 'http://www.w3.org/2000/svg';

function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function svgEl(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** An island circle with its number in a one-unit box; the how-to and dashboard reuse it. */
export function islandSvg(n: number): SVGSVGElement {
  const svg = svgEl('svg', { viewBox: '0 0 1 1', 'aria-hidden': 'true' }) as SVGSVGElement;
  svg.classList.add('bridges-island-icon');
  svg.append(islandShape(0.5, 0.5, n));
  return svg;
}

function islandShape(x: number, y: number, n: number): SVGElement {
  const g = svgEl('g');
  g.append(svgEl('circle', { cx: x, cy: y, r: ISLAND_R }));
  const t = svgEl('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
  t.textContent = String(n);
  g.append(t);
  return g;
}

function centre(p: Puzzle, island: number): { x: number; y: number } {
  const cell = p.islands[island].cell;
  return { x: (cell % p.size) + 0.5, y: Math.floor(cell / p.size) + 0.5 };
}

/** Edge-to-edge segment between a link's islands, shifted `off` units across the bridge. */
function linkSegment(p: Puzzle, link: number, off = 0): { x1: number; y1: number; x2: number; y2: number } {
  const l = p.links[link];
  const a = centre(p, l.a);
  const b = centre(p, l.b);
  return l.horizontal
    ? { x1: a.x + ISLAND_R, y1: a.y + off, x2: b.x - ISLAND_R, y2: b.y + off }
    : { x1: a.x + off, y1: a.y + ISLAND_R, x2: b.x + off, y2: b.y - ISLAND_R };
}

export function createBridgesBoard(
  el: HTMLElement,
  opts: { onCycle: (link: number) => void; onRemove: (link: number) => void },
): BridgesBoardHandle {
  const panel = document.createElement('div');
  panel.className = 'bridges-panel glass';
  const svg = svgEl('svg', { class: 'bridges-svg', role: 'group', 'aria-label': 'Board' }) as SVGSVGElement;
  const dotsEl = svgEl('g', { class: 'bridges-dots' });
  const linksEl = svgEl('g', { class: 'bridges-links' });
  const previewEl = svgEl('line', { class: 'bridges-preview' }) as SVGLineElement;
  const islandsEl = svgEl('g', { class: 'bridges-islands' });
  svg.append(dotsEl, linksEl, previewEl, islandsEl);
  panel.appendChild(svg);
  el.appendChild(panel);

  let game: GameState | null = null;
  let linkEls: SVGElement[] = [];
  let islandEls: SVGElement[] = [];
  let input: InputState = initialInput;
  /** The pointer driving the current gesture; other pointers are ignored until it ends. */
  let activePointer: number | null = null;
  let interactive = true;
  let blockTimers: ReturnType<typeof setTimeout>[] = [];
  let glowTimers: ReturnType<typeof setTimeout>[] = [];
  let settleWave: (() => void) | null = null;

  function render(): void {
    const s = game;
    if (!s) return;
    const p = s.puzzle;
    s.bridges.forEach((v, i) => {
      const g = linkEls[i];
      if (g.dataset.count === String(v)) return;
      g.dataset.count = String(v);
      const offs = v === 0 ? [] : v === 1 ? [0] : [-DOUBLE_OFFSET, DOUBLE_OFFSET];
      g.replaceChildren(...offs.map((o) => svgEl('line', linkSegment(p, i, o))));
    });
    const tot = islandTotals(s);
    const bad = violations(s);
    islandEls.forEach((g, i) => {
      const n = p.islands[i].n;
      g.setAttribute('aria-label', `Island, ${n}, ${tot[i]} of ${n} bridges`);
      g.classList.toggle('is-done', tot[i] === n);
      g.classList.toggle('is-over', bad.over.has(i));
      // Added fresh each time the network splits, so the one-shot pulse replays.
      g.classList.toggle('is-split', bad.split.has(i));
    });
  }

  function showPreview(link: number): void {
    if (link < 0 || !game) {
      previewEl.style.display = 'none';
      return;
    }
    for (const [k, v] of Object.entries(linkSegment(game.puzzle, link))) previewEl.setAttribute(k, String(v));
    previewEl.style.display = '';
  }

  function fit(): void {
    if (!game) return;
    const w = el.clientWidth;
    if (w <= 0) return;
    const n = game.puzzle.size;
    const byWidth = (w - 2 * PANEL_PAD) / n;
    const byHeight = (window.innerHeight - PAGE_CHROME) / n;
    const size = Math.floor(Math.min(byWidth, byHeight));
    panel.style.setProperty('--cell', Math.min(MAX_CELL, Math.max(MIN_CELL, size)) + 'px');
  }

  /** The pointer in cell units; off-board points pass through unclamped. */
  function point(e: MouseEvent): { x: number; y: number } | null {
    const n = game!.puzzle.size;
    const b = svg.getBoundingClientRect();
    if (b.width <= 0 || b.height <= 0) return null;
    return { x: ((e.clientX - b.left) / b.width) * n, y: ((e.clientY - b.top) / b.height) * n };
  }

  function send(e: InputEvent): void {
    if (!game) return;
    const r = step(game.puzzle, input, e);
    input = r.state;
    for (const a of r.actions) {
      if (a.kind === 'preview') showPreview(a.link);
      else opts.onCycle(a.link);
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
      showPreview(-1); // a restart after a lost pointerup must not keep the old preview
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

  /** Window blur drops any gesture. */
  function onCancel(): void {
    send({ type: 'cancel' });
    endGesture();
  }

  /** Pointer cancel and lost capture drop only their own pointer's gesture. */
  function onPointerCancel(e: PointerEvent): void {
    if (e.pointerId === activePointer) onCancel();
  }

  /**
   * Right-click removes a bridge from the link under the point; the browser menu never opens over the board.
   * A touch long-press also lands here, so it drops the gesture first or its pointerup would tap the link.
   */
  function onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    if (!interactive || !game) return;
    if (activePointer !== null) onCancel();
    const at = point(e);
    if (!at) return;
    const link = linkNear(game.puzzle, at.x, at.y);
    if (link >= 0) opts.onRemove(link);
  }

  svg.addEventListener('pointerdown', onPointer);
  svg.addEventListener('pointermove', onPointer);
  svg.addEventListener('pointerup', onPointer);
  svg.addEventListener('pointercancel', onPointerCancel);
  svg.addEventListener('lostpointercapture', onPointerCancel);
  panel.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('blur', onCancel);
  window.addEventListener('resize', fit);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  ro?.observe(el);

  function clearBlocked(): void {
    for (const t of blockTimers) clearTimeout(t);
    blockTimers = [];
    for (const g of linkEls) g.classList.remove('is-blocked');
  }

  function clearGlow(): void {
    for (const t of glowTimers) clearTimeout(t);
    glowTimers = [];
    for (const g of linkEls) g.classList.remove('is-glow');
    const settle = settleWave;
    settleWave = null;
    settle?.();
  }

  /** Per bridged link, its breadth-first step from island 0 over bridged links. */
  function waveSteps(s: GameState): { link: number; step: number }[] {
    const p = s.puzzle;
    const depth = p.islands.map(() => -1);
    depth[0] = 0;
    const queue = [0];
    while (queue.length > 0) {
      const i = queue.shift()!;
      for (const l of p.islandLinks[i]) {
        if (s.bridges[l] === 0) continue;
        const j = p.links[l].a === i ? p.links[l].b : p.links[l].a;
        if (depth[j] >= 0) continue;
        depth[j] = depth[i] + 1;
        queue.push(j);
      }
    }
    return p.links.flatMap((l, link) =>
      s.bridges[link] === 0 ? [] : [{ link, step: Math.max(0, Math.min(depth[l.a], depth[l.b])) }],
    );
  }

  return {
    setGame(s) {
      game = s;
      endGesture();
      clearBlocked();
      clearGlow();
      showPreview(-1);
      const p = s.puzzle;
      const n = p.size;
      svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
      panel.style.setProperty('--n', String(n));
      const islandCells = new Set(p.islands.map((isl) => isl.cell));
      const dots: SVGElement[] = [];
      for (let i = 0; i < n * n; i++) {
        if (!islandCells.has(i)) dots.push(svgEl('circle', { cx: (i % n) + 0.5, cy: Math.floor(i / n) + 0.5, r: 0.04 }));
      }
      dotsEl.replaceChildren(...dots);
      linkEls = p.links.map((_, i) => {
        const g = svgEl('g', { class: 'bridges-link' });
        g.dataset.link = String(i);
        return g;
      });
      linksEl.replaceChildren(...linkEls);
      islandEls = p.islands.map((isl, i) => {
        const { x, y } = centre(p, i);
        const g = islandShape(x, y, isl.n);
        g.setAttribute('class', 'bridges-island');
        g.setAttribute('role', 'img');
        g.dataset.island = String(i);
        return g;
      });
      islandsEl.replaceChildren(...islandEls);
      render();
      fit();
    },

    render,

    flashBlocked(links) {
      for (const l of links) {
        const g = linkEls[l];
        if (!g) continue;
        g.classList.remove('is-blocked');
        void g.getBoundingClientRect(); // restart the flash if it is already showing
        g.classList.add('is-blocked');
        blockTimers.push(setTimeout(() => g.classList.remove('is-blocked'), BLOCKED_MS));
      }
    },

    celebrate() {
      if (!game || reducedMotion()) return Promise.resolve();
      clearGlow();
      const steps = waveSteps(game);
      if (steps.length === 0) return Promise.resolve();
      for (const { link, step: k } of steps) {
        glowTimers.push(setTimeout(() => linkEls[link]?.classList.add('is-glow'), k * WAVE_STEP_MS));
      }
      const end = Math.max(...steps.map((x) => x.step)) * WAVE_STEP_MS + GLOW_MS;
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
      el.classList.toggle('bridges-board--locked', !on);
      if (!on) {
        endGesture();
        showPreview(-1);
      }
    },

    destroy() {
      clearBlocked();
      clearGlow();
      window.removeEventListener('blur', onCancel);
      window.removeEventListener('resize', fit);
      ro?.disconnect();
      el.textContent = '';
    },
  };
}
