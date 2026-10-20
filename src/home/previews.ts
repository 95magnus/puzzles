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
