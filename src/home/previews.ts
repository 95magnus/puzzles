import { PALETTE } from '../ui/palette';

const NS = 'http://www.w3.org/2000/svg';
const CELL = 16;

function s(tag: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  return e;
}

function frame(): SVGSVGElement {
  const svg = s('svg', { class: 'puzzle-preview', viewBox: '0 0 64 64', 'aria-hidden': 'true' }) as SVGSVGElement;
  svg.append(s('rect', { x: 0.5, y: 0.5, width: 63, height: 63, rx: 10, fill: 'rgba(255,255,255,.06)', stroke: 'rgba(255,255,255,.12)' }));
  return svg;
}

const at = (n: number) => n * CELL + CELL / 2;

/** 4×4 Flow board: two finished paths with their end dots. */
export function flowPreview(): SVGSVGElement {
  const svg = frame();
  for (const i of [1, 2, 3]) {
    svg.append(s('line', { x1: i * CELL, y1: 3, x2: i * CELL, y2: 61, stroke: 'rgba(255,255,255,.08)' }));
    svg.append(s('line', { x1: 3, y1: i * CELL, x2: 61, y2: i * CELL, stroke: 'rgba(255,255,255,.08)' }));
  }
  const paths: [string, [number, number], [number, number]][] = [
    [`M${at(0)} ${at(0)} H${at(3)} V${at(1)}`, [0, 0], [3, 1]],
    [`M${at(0)} ${at(3)} V${at(1)} H${at(2)}`, [0, 3], [2, 1]],
  ];
  paths.forEach(([d, a, b], i) => {
    const color = PALETTE[i + 1];
    svg.append(s('path', { d, fill: 'none', stroke: color, 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.85 }));
    for (const [c, r] of [a, b]) svg.append(s('circle', { cx: at(c), cy: at(r), r: 5, fill: color }));
  });
  return svg;
}

/** 4×4 Mines corner: revealed numbers, hidden tiles and one flag. */
export function minesPreview(): SVGSVGElement {
  const svg = frame();
  // r = revealed, h = hidden, f = flagged; digits are revealed numbers.
  const layout = ['rr1h', 'r12h', '12fh', 'hhhh'];
  const colors: Record<string, string> = { '1': '#4cb0ff', '2': '#34e3a0' };
  layout.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      const hidden = ch === 'h' || ch === 'f';
      svg.append(s('rect', { x: c * CELL + 2, y: r * CELL + 2, width: CELL - 4, height: CELL - 4, rx: 3, fill: hidden ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.25)' }));
      if (colors[ch]) {
        const t = s('text', { x: at(c), y: at(r) + 3.5, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: colors[ch] });
        t.textContent = ch;
        svg.append(t);
      } else if (ch === 'f') {
        svg.append(s('path', { d: `M${at(c) - 2} ${at(r) - 4}v8`, stroke: '#eef0f7', 'stroke-width': 1.2, 'stroke-linecap': 'round' }));
        svg.append(s('path', { d: `M${at(c) - 1.5} ${at(r) - 4}l5 2-5 2z`, fill: '#ffd447' }));
      }
    });
  });
  return svg;
}

/** Tangle: four bent neon strokes, each ending in an arrowhead. */
export function tanglePreview(): SVGSVGElement {
  const svg = frame();
  // [path, arrowhead tip x, tip y, direction dx, dy]
  // Deliberately lopsided: no rotational symmetry, so the strokes never read as a pinwheel.
  const strokes: [string, number, number, number, number][] = [
    ['M10 13 H38 V23 H50', 50, 23, 1, 0],
    ['M12 52 V30 H24 V22', 24, 22, 0, -1],
    ['M22 40 H42 V50', 42, 50, 0, 1],
  ];
  strokes.forEach(([d, x, y, dx, dy], i) => {
    const color = PALETTE[i + 1];
    svg.append(s('path', { d, fill: 'none', stroke: color, 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    // Arrowhead: triangle pointing along (dx, dy), tip at (x, y) pushed 3 further.
    const tx = x + dx * 3, ty = y + dy * 3;
    const bx = x - dx * 2, by = y - dy * 2;
    const px = -dy * 4, py = dx * 4;
    svg.append(s('path', { d: `M${tx} ${ty} L${bx + px} ${by + py} L${bx - px} ${by - py} Z`, fill: color }));
  });
  return svg;
}

/** Queens: 5×5 board of tinted regions with thick region borders and five queens. */
export function queensPreview(): SVGSVGElement {
  const svg = frame();
  const N = 5, size = 12, o = 2; // 5 cells of 12 centred in the 64 frame
  // Region id per cell (= PALETTE index); the queens are the unique non-touching solution.
  const regions = [
    [0, 0, 1, 1, 1],
    [0, 2, 2, 1, 3],
    [0, 2, 3, 3, 3],
    [4, 2, 3, 4, 4],
    [4, 4, 4, 4, 4],
  ];
  const queens = [[0, 2], [1, 0], [2, 3], [3, 1], [4, 4]];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      svg.append(s('rect', { x: o + 1 + c * size, y: o + 1 + r * size, width: size, height: size, fill: PALETTE[regions[r][c]], opacity: 0.4 }));
    }
  }
  // Thick borders only where neighbouring cells belong to different regions.
  const edge = (x1: number, y1: number, x2: number, y2: number) =>
    svg.append(s('line', { x1, y1, x2, y2, stroke: 'rgba(238,240,247,.85)', 'stroke-width': 1.6, 'stroke-linecap': 'round' }));
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const x = o + 1 + c * size, y = o + 1 + r * size;
      if (c < N - 1 && regions[r][c] !== regions[r][c + 1]) edge(x + size, y, x + size, y + size);
      if (r < N - 1 && regions[r][c] !== regions[r + 1][c]) edge(x, y + size, x + size, y + size);
    }
  }
  svg.append(s('rect', { x: o + 1, y: o + 1, width: N * size, height: N * size, fill: 'none', stroke: 'rgba(238,240,247,.85)', 'stroke-width': 1.6 }));
  for (const [r, c] of queens) {
    const t = s('text', { x: o + 1 + c * size + size / 2, y: o + 1 + r * size + size / 2 + 4, 'text-anchor': 'middle', 'font-size': 11, fill: '#eef0f7' });
    t.textContent = '♛';
    svg.append(t);
  }
  return svg;
}
