import { openModal } from '../../ui/modal';
import { islandSvg } from './board';

const RULES = [
  'Connect the islands with bridges.',
  'Each number says how many bridges touch that island.',
  'Bridges run straight, never cross, and at most two join the same pair.',
  'All islands must join into one network.',
  'Drag from an island or tap the gap to add a bridge. Right-click removes one.',
];

const NS = 'http://www.w3.org/2000/svg';
const DEMO_SIZE = 4;
/** A solved 4×4: islands at [row, col, number], bridges as [from, to, count] between them. */
const DEMO_ISLANDS: [number, number, number][] = [
  [0, 0, 3],
  [0, 3, 3],
  [2, 0, 1],
  [3, 1, 2],
  [3, 3, 3],
];
const DEMO_BRIDGES: [number, number, 1 | 2][] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 4, 1],
  [3, 4, 2],
];
const R = 0.35;
const OFFSET = 0.11;

/** A small inert board drawn with the real island glyph, so it looks like the game. */
function demoEl(): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${DEMO_SIZE} ${DEMO_SIZE}`);
  svg.setAttribute('class', 'bridges-howto__demo');
  svg.setAttribute('aria-hidden', 'true');
  const links = document.createElementNS(NS, 'g');
  links.setAttribute('class', 'bridges-links');
  for (const [a, b, count] of DEMO_BRIDGES) {
    const [ra, ca] = DEMO_ISLANDS[a];
    const [rb, cb] = DEMO_ISLANDS[b];
    const horizontal = ra === rb;
    for (const off of count === 1 ? [0] : [-OFFSET, OFFSET]) {
      const line = document.createElementNS(NS, 'line');
      const seg = horizontal
        ? { x1: ca + 0.5 + R, y1: ra + 0.5 + off, x2: cb + 0.5 - R, y2: rb + 0.5 + off }
        : { x1: ca + 0.5 + off, y1: ra + 0.5 + R, x2: cb + 0.5 + off, y2: rb + 0.5 - R };
      for (const [k, v] of Object.entries(seg)) line.setAttribute(k, String(v));
      links.appendChild(line);
    }
  }
  svg.appendChild(links);
  for (const [r, c, n] of DEMO_ISLANDS) {
    const isl = islandSvg(n);
    isl.classList.add('bridges-howto__island');
    for (const [k, v] of Object.entries({ x: c, y: r, width: 1, height: 1 })) isl.setAttribute(k, String(v));
    svg.appendChild(isl);
  }
  return svg;
}

/** Modal with the rules and a small solved board; the shared modal handles closing and focus. */
export function openBridgesHowto(returnFocusTo: HTMLElement): void {
  const list = document.createElement('ul');
  for (const rule of RULES) {
    const li = document.createElement('li');
    li.textContent = rule;
    list.appendChild(li);
  }
  const body = document.createElement('div');
  body.className = 'bridges-howto__body';
  body.append(list, demoEl());
  openModal({ title: 'How to play', body: [body], returnFocus: returnFocusTo });
}
