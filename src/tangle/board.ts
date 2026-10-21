import { PALETTE } from '../ui/palette';
import { exitLine } from './solver';
import { DIRS, type GameState, type Level, type TapResult } from './types';

export type TangleBoardHandle = {
  /** Full render of the alive arrows (cancels any animation in flight). */
  setGame(s: GameState): void;
  /** Animate an exit or bump; resolves when done. `ignored` resolves at once. */
  play(r: TapResult): Promise<void>;
  setInteractive(on: boolean): void;
  destroy(): void;
};

export type Pt = [x: number, y: number];

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Must match `.tangle-panel` padding in tangle.css. */
const PANEL_PAD = 12;
/** Cell size bounds in px. Fitting the viewport wins over legibility down to MIN_CELL. */
const MIN_CELL = 12;
const MAX_CELL = 28;
/** Animation speed in cells per second. */
const SPEED = 30;
const EXIT_MAX_MS = 600;
/** Each leg (out, back) of a bump; two legs stay within the 500 ms budget with the flash. */
const BUMP_LEG_MAX_MS = 200;
/** How far past `distance` the head slides so it visibly touches the blocker. */
const BUMP_CONTACT = 0.7;
const FLASH_MS = 250;
const HEAD = 0.42;

/** Whole-pixel cell size that fits `cols × rows` into `availW × availH` px, clamped to [MIN_CELL, MAX_CELL]. */
export function fitCell(cols: number, rows: number, availW: number, availH: number): number {
  return Math.min(MAX_CELL, Math.max(MIN_CELL, Math.floor(Math.min(availW / cols, availH / rows))));
}

/**
 * Height of the page content in px. Not `scrollHeight`: the body's `min-height: 100vh` floors that at
 * the viewport, so a board that once shrank could never grow back.
 */
function contentHeight(): number {
  let bottom = 0;
  for (const c of document.body.children) bottom = Math.max(bottom, c.getBoundingClientRect().bottom);
  return bottom + window.scrollY;
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Cell centres of arrow `i` tail → head, then `extra` points straight on in its direction. */
export function trackFor(level: Level, i: number, extra: number): Pt[] {
  const { cols } = level;
  const a = level.arrows[i];
  const pts: Pt[] = a.cells.map((cell) => [(cell % cols) + 0.5, Math.floor(cell / cols) + 0.5]);
  const [dc, dr] = DIRS[a.dir];
  const [hx, hy] = pts[pts.length - 1];
  for (let k = 1; k <= extra; k++) pts.push([hx + dc * k, hy + dr * k]);
  return pts;
}

/** Point `t` cells along the track; extrapolates past either end along the end segment. */
function pointAt(track: Pt[], t: number): Pt {
  const n = track.length;
  if (n === 1) return [track[0][0], track[0][1]];
  const k = Math.min(Math.max(Math.floor(t), 0), n - 2);
  const f = t - k;
  const [x0, y0] = track[k];
  const [x1, y1] = track[k + 1];
  return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
}

/** Polyline of a `len`-cell arrow whose tail sits `offset` cells along `track`. */
export function bodyAt(track: Pt[], len: number, offset: number): Pt[] {
  const end = offset + len - 1;
  const out: Pt[] = [pointAt(track, offset)];
  for (let k = Math.floor(offset) + 1; k < end; k++) out.push(pointAt(track, k));
  if (end > offset) out.push(pointAt(track, end));
  return out;
}

const fmt = (v: number) => String(Math.round(v * 1000) / 1000);

function pathD(pts: Pt[]): string {
  return pts.map(([x, y], k) => (k ? 'L' : 'M') + fmt(x) + ' ' + fmt(y)).join('');
}

/** Triangle of side ≈ HEAD centred on `h`, pointing along `[dc, dr]`. */
function headPoints([hx, hy]: Pt, [dc, dr]: readonly [number, number]): string {
  const s = HEAD / 2;
  const tip: Pt = [hx + dc * s, hy + dr * s];
  const b1: Pt = [hx - dc * s - dr * s, hy - dr * s + dc * s];
  const b2: Pt = [hx - dc * s + dr * s, hy - dr * s - dc * s];
  return [tip, b1, b2].map(([x, y]) => fmt(x) + ',' + fmt(y)).join(' ');
}

type Anim = { cancel(): void };

export function createTangleBoard(el: HTMLElement, opts: { onTap: (cell: number) => void }): TangleBoardHandle {
  const panel = document.createElement('div');
  panel.className = 'tangle-panel glass';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'tangle-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Tangle board');
  panel.appendChild(svg);
  el.appendChild(panel);

  let game: GameState | null = null;
  /** Cell size last applied by fit(); 0 forces the next fit to apply. */
  let cellPx = 0;
  let groups = new Map<number, SVGGElement>();
  let interactive = true;
  let busy = false;
  /** Bumped by setGame/destroy so a superseded play() leaves the new board alone. */
  let gen = 0;
  const anims = new Set<Anim>();

  function draw(i: number, offset: number, track: Pt[]): void {
    const g = groups.get(i);
    if (!g || !game) return;
    const a = game.level.arrows[i];
    const pts = bodyAt(track, a.cells.length, offset);
    g.querySelector('path')!.setAttribute('d', pathD(pts));
    g.querySelector('polygon')!.setAttribute('points', headPoints(pts[pts.length - 1], DIRS[a.dir]));
  }

  function makeGroup(i: number): SVGGElement {
    const a = game!.level.arrows[i];
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'tangle-arrow');
    g.dataset.a = String(i);
    g.style.setProperty('--c', PALETTE[a.color] ?? PALETTE[0]);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('style', 'stroke: var(--c)');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-width', '.26');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    const head = document.createElementNS(SVG_NS, 'polygon');
    head.setAttribute('style', 'fill: var(--c); stroke: var(--c)');
    head.setAttribute('stroke-width', '.06');
    head.setAttribute('stroke-linejoin', 'round');
    g.append(path, head);
    return g;
  }

  function fit(): void {
    if (!game) return;
    const w = el.clientWidth;
    if (w <= 0) return;
    const { cols, rows } = game.level;
    // Everything on the page except the svg (header, subtitle, HUD, panel padding), measured with the
    // svg at its current size. It does not depend on the svg's size, so re-fitting cannot loop.
    const chrome = Math.max(0, contentHeight() - svg.getBoundingClientRect().height);
    const size = fitCell(cols, rows, w - 2 * PANEL_PAD, window.innerHeight - chrome);
    if (size === cellPx) return;
    cellPx = size;
    svg.style.width = cols * size + 'px';
    svg.style.height = rows * size + 'px';
  }

  /** Run `frame(t)` for t ∈ [0, 1] over `ms`; resolves after the frame with t = 1 (or on cancel). */
  function animate(ms: number, frame: (t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      let id = 0;
      let start = -1;
      const anim: Anim = {
        cancel() {
          cancelAnimationFrame(id);
          anims.delete(anim);
          resolve();
        },
      };
      anims.add(anim);
      const tick = (now: number) => {
        if (start < 0) start = now;
        const t = ms > 0 ? Math.min(1, (now - start) / ms) : 1;
        frame(t);
        if (t < 1) id = requestAnimationFrame(tick);
        else anim.cancel();
      };
      id = requestAnimationFrame(tick);
    });
  }

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const id = setTimeout(() => anim.cancel(), ms);
      const anim: Anim = {
        cancel() {
          clearTimeout(id);
          anims.delete(anim);
          resolve();
        },
      };
      anims.add(anim);
    });
  }

  function cancelAll(): void {
    for (const a of [...anims]) a.cancel();
  }

  function flash(arrows: number[]): Promise<void> {
    const gs = arrows.map((i) => groups.get(i)).filter((g): g is SVGGElement => !!g);
    for (const g of gs) g.classList.add('is-bump');
    return wait(FLASH_MS).then(() => {
      for (const g of gs) g.classList.remove('is-bump');
    });
  }

  function remove(i: number): void {
    groups.get(i)?.remove();
    groups.delete(i);
  }

  async function playExit(i: number): Promise<void> {
    const level = game!.level;
    if (reducedMotion()) {
      remove(i);
      return;
    }
    const len = level.arrows[i].cells.length;
    // The tail (round cap included) clears the edge after len - 1 + line + 0.5 + 0.13 cells.
    const dist = len + exitLine(level, i).length;
    const track = trackFor(level, i, dist + 1);
    const g = groups.get(i);
    g?.parentNode?.appendChild(g); // slide over the other arrows
    const ms = Math.min(EXIT_MAX_MS, (dist / SPEED) * 1000);
    const g0 = gen;
    await animate(ms, (t) => draw(i, dist * t, track));
    if (g0 === gen) remove(i);
  }

  async function playBump(i: number, blocker: number, distance: number): Promise<void> {
    if (reducedMotion()) {
      await flash([i, blocker]);
      return;
    }
    const level = game!.level;
    const peak = distance + BUMP_CONTACT;
    const track = trackFor(level, i, Math.ceil(peak) + 1);
    const ms = Math.min(BUMP_LEG_MAX_MS, (peak / SPEED) * 1000);
    const ease = (t: number) => 1 - (1 - t) * (1 - t);
    const g0 = gen;
    await animate(ms, (t) => draw(i, peak * ease(t), track));
    if (g0 !== gen) return;
    const flashed = flash([i, blocker]);
    await animate(ms, (t) => draw(i, peak * (1 - ease(t)), track));
    await flashed;
    if (g0 === gen) draw(i, 0, track);
  }

  /** pointerId of the primary press that started on the svg; -1 when none. */
  let downId = -1;

  const isPrimaryPress = (e: PointerEvent) => e.isPrimary === true && e.button === 0;

  function onPointerDown(e: PointerEvent): void {
    downId = isPrimaryPress(e) ? e.pointerId : -1;
  }

  function onPointerCancel(): void {
    downId = -1;
  }

  function onPointerUp(e: PointerEvent): void {
    // Only a primary-button release of a press that began on the svg is a tap.
    const matched = downId !== -1 && downId === e.pointerId && isPrimaryPress(e);
    if (isPrimaryPress(e) || downId === e.pointerId) downId = -1;
    if (!matched) return;
    if (!interactive || busy || !game) return;
    const { cols, rows } = game.level;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * cols);
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * rows);
    if (c < 0 || c >= cols || r < 0 || r >= rows) return;
    opts.onTap(r * cols + c);
  }

  const onContextMenu = (e: Event) => e.preventDefault();

  svg.addEventListener('pointerdown', onPointerDown as EventListener);
  svg.addEventListener('pointerup', onPointerUp as EventListener);
  svg.addEventListener('pointercancel', onPointerCancel);
  panel.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('resize', fit);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  ro?.observe(el);
  // Web fonts change the chrome's height once loaded.
  void document.fonts?.ready.then(() => fit());

  return {
    setGame(s) {
      gen++;
      cancelAll();
      busy = false;
      game = s;
      const { cols, rows, arrows } = s.level;
      svg.setAttribute('viewBox', `0 0 ${cols} ${rows}`);
      cellPx = 0;
      svg.textContent = '';
      groups = new Map();
      for (let i = 0; i < arrows.length; i++) {
        if (!s.alive[i]) continue;
        const g = makeGroup(i);
        groups.set(i, g);
        svg.appendChild(g);
        draw(i, 0, trackFor(s.level, i, 0));
      }
      fit();
    },

    async play(r) {
      if (r.kind === 'ignored' || !game) return;
      busy = true;
      const g0 = gen;
      try {
        if (r.kind === 'exit') await playExit(r.arrow);
        else await playBump(r.arrow, r.blocker, r.distance);
      } finally {
        if (g0 === gen) busy = false;
      }
    },

    setInteractive(on) {
      interactive = on;
      el.classList.toggle('tangle-board--locked', !on);
    },

    destroy() {
      gen++;
      cancelAll();
      svg.removeEventListener('pointerdown', onPointerDown as EventListener);
      svg.removeEventListener('pointerup', onPointerUp as EventListener);
      svg.removeEventListener('pointercancel', onPointerCancel);
      panel.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('resize', fit);
      ro?.disconnect();
      el.textContent = '';
    },
  };
}
