import { PALETTE } from '../ui/palette';
import { exitLine } from './solver';
import { DIRS, type GameState, type Level, type TapResult } from './types';
import { PANEL_PAD, fitCell, reducedMotion, watchSize } from '../ui/fit';

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
/** Cell size bounds in px. Fitting the viewport wins over legibility down to MIN_CELL. */
const MIN_CELL = 12;
const MAX_CELL = 28;
/** Animation speed in cells per second. */
const SPEED = 45;
const EXIT_MAX_MS = 400;
/** Each leg (out, back) of a bump. */
const BUMP_LEG_MAX_MS = 140;
/** How far past `distance` the head slides so it visibly touches the blocker. */
const BUMP_CONTACT = 0.7;
const FLASH_MS = 200;
/** After a bump costs a life, the whole board ignores taps this long (from the tap). */
export const BUMP_COOLDOWN_MS = 700;
const HEAD = 0.42;
/** A tap hits the nearest arrow whose centre line is within this many cells. */
const HIT_RADIUS = 0.75;

let boardCount = 0;

/**
 * Height of the page content in px. Not `scrollHeight`: the body's `min-height: 100vh` floors that at
 * the viewport, so a board that once shrank could never grow back.
 */
function contentHeight(): number {
  let bottom = 0;
  for (const c of document.body.children) bottom = Math.max(bottom, c.getBoundingClientRect().bottom);
  return bottom + window.scrollY;
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

/** Distance from `p` to the segment `a`–`b`. */
function segDist([px, py]: Pt, [ax, ay]: Pt, [bx, by]: Pt): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** Distance from `p` (in cell units) to the centre line of arrow `i`. */
export function arrowDist(level: Level, i: number, p: Pt): number {
  const pts = trackFor(level, i, 0);
  if (pts.length === 1) return Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]);
  let best = Infinity;
  for (let k = 1; k < pts.length; k++) best = Math.min(best, segDist(p, pts[k - 1], pts[k]));
  return best;
}

/**
 * The arrow a tap at `p` (cell units) means: the nearest one among `owner`'s arrows in the 3×3 cells
 * around `p`, if its centre line is within HIT_RADIUS. `owner` maps cell → arrow, -1 when empty.
 */
export function pickArrow(level: Level, owner: Int32Array, p: Pt): number {
  const { cols, rows } = level;
  const c0 = Math.floor(p[0]);
  const r0 = Math.floor(p[1]);
  let best = -1;
  let bestD = HIT_RADIUS;
  for (let r = r0 - 1; r <= r0 + 1; r++) {
    if (r < 0 || r >= rows) continue;
    for (let c = c0 - 1; c <= c0 + 1; c++) {
      if (c < 0 || c >= cols) continue;
      const i = owner[r * cols + c];
      if (i < 0 || i === best) continue;
      const d = arrowDist(level, i, p);
      if (d <= bestD) {
        best = i;
        bestD = d;
      }
    }
  }
  return best;
}

/** Faint dots at every cell centre, with a sparser brighter layer so the field reads like stars. */
function starfield(id: string, cols: number, rows: number): SVGElement[] {
  const defs = document.createElementNS(SVG_NS, 'defs');
  defs.innerHTML =
    `<pattern id="${id}-a" patternUnits="userSpaceOnUse" width="1" height="1">` +
    `<circle cx=".5" cy=".5" r=".045" class="tangle-star"/></pattern>` +
    `<pattern id="${id}-b" patternUnits="userSpaceOnUse" width="7" height="5">` +
    `<circle cx="1.5" cy=".5" r=".065" class="tangle-star tangle-star--bright"/>` +
    `<circle cx="4.5" cy="2.5" r=".065" class="tangle-star tangle-star--bright"/>` +
    `<circle cx="2.5" cy="3.5" r=".055" class="tangle-star tangle-star--bright"/>` +
    `<circle cx="6.5" cy="4.5" r=".055" class="tangle-star tangle-star--bright"/></pattern>`;
  const layer = (suffix: string) => {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('width', String(cols));
    rect.setAttribute('height', String(rows));
    rect.setAttribute('fill', `url(#${id}-${suffix})`);
    rect.setAttribute('class', 'tangle-stars');
    return rect;
  };
  return [defs, layer('a'), layer('b')];
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
  /** Cell → arrow for every arrow still drawn, including ones animating out. */
  let owner = new Int32Array(0);
  /** Arrows mid-animation; taps on them are ignored so a double-tap never costs two lives. */
  const moving = new Set<number>();
  let interactive = true;
  /** Pending end of a post-bump cooldown; 0 when none. */
  let stunTimer = 0;
  const starId = `tangle-stars-${++boardCount}`;
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
    const size = fitCell(cols, rows, w - 2 * PANEL_PAD, window.innerHeight - chrome, { min: MIN_CELL, max: MAX_CELL });
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
    unstun();
  }

  /** Lose-a-life cooldown: every tap is ignored until it ends. A new bump restarts it. */
  function stun(): void {
    clearTimeout(stunTimer);
    el.classList.add('tangle-board--stunned');
    stunTimer = window.setTimeout(unstun, BUMP_COOLDOWN_MS);
  }

  function unstun(): void {
    clearTimeout(stunTimer);
    stunTimer = 0;
    el.classList.remove('tangle-board--stunned');
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
    if (game) for (const cell of game.level.arrows[i].cells) if (owner[cell] === i) owner[cell] = -1;
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
    if (!interactive || stunTimer || !game) return;
    const { level } = game;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const p: Pt = [
      ((e.clientX - rect.left) / rect.width) * level.cols,
      ((e.clientY - rect.top) / rect.height) * level.rows,
    ];
    const i = pickArrow(level, owner, p);
    if (i < 0 || moving.has(i)) return;
    opts.onTap(level.arrows[i].cells[level.arrows[i].cells.length - 1]);
  }

  const onContextMenu = (e: Event) => e.preventDefault();

  svg.addEventListener('pointerdown', onPointerDown as EventListener);
  svg.addEventListener('pointerup', onPointerUp as EventListener);
  svg.addEventListener('pointercancel', onPointerCancel);
  panel.addEventListener('contextmenu', onContextMenu);
  const stopFit = watchSize(el, fit);
  // Web fonts change the chrome's height once loaded.
  void document.fonts?.ready.then(() => fit());

  return {
    setGame(s) {
      gen++;
      cancelAll();
      moving.clear();
      game = s;
      const { cols, rows, arrows } = s.level;
      svg.setAttribute('viewBox', `0 0 ${cols} ${rows}`);
      cellPx = 0;
      svg.textContent = '';
      svg.append(...starfield(starId, cols, rows));
      groups = new Map();
      owner = new Int32Array(cols * rows).fill(-1);
      for (let i = 0; i < arrows.length; i++) {
        if (!s.alive[i]) continue;
        const g = makeGroup(i);
        groups.set(i, g);
        svg.appendChild(g);
        for (const cell of arrows[i].cells) owner[cell] = i;
        draw(i, 0, trackFor(s.level, i, 0));
      }
      fit();
    },

    async play(r) {
      if (r.kind === 'ignored' || !game) return;
      const g0 = gen;
      moving.add(r.arrow);
      if (r.kind === 'bump') stun();
      try {
        if (r.kind === 'exit') await playExit(r.arrow);
        else await playBump(r.arrow, r.blocker, r.distance);
      } finally {
        if (g0 === gen) moving.delete(r.arrow);
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
      stopFit();
      el.textContent = '';
    },
  };
}
