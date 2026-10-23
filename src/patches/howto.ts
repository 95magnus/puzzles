import { PALETTE } from '../ui/palette';
import { openModal } from '../ui/modal';

const RULES = [
  'Split the grid into rectangles. Every cell belongs to one.',
  'Each rectangle holds exactly one clue.',
  'The icon is its shape — square, wide, tall or any. The number is its area.',
  'Drag to draw a rectangle. Tap one to remove it.',
  'Broken rectangles turn red.',
];

/** The solved 4×4 used for the illustration: each rectangle with the cell of its clue and area. */
const DEMO: { r: number; c: number; w: number; h: number; clue: [r: number, c: number]; area: number }[] = [
  { r: 0, c: 0, w: 2, h: 2, clue: [0, 0], area: 4 },
  { r: 0, c: 3, w: 1, h: 4, clue: [0, 3], area: 4 },
  { r: 0, c: 2, w: 1, h: 2, clue: [1, 2], area: 2 },
  { r: 2, c: 0, w: 3, h: 1, clue: [2, 0], area: 3 },
  { r: 3, c: 0, w: 3, h: 1, clue: [3, 1], area: 3 },
];

function demoSvg(): string {
  const parts = DEMO.map((d, i) => {
    const col = PALETTE[i];
    const rect = `<rect x="${d.c + 0.06}" y="${d.r + 0.06}" width="${d.w - 0.12}" height="${d.h - 0.12}" rx=".12" fill="${col}" fill-opacity=".4" stroke="${col}" stroke-width=".08"/>`;
    const num = `<text x="${d.clue[1] + 0.5}" y="${d.clue[0] + 0.5}" text-anchor="middle" dominant-baseline="central" font-size=".5" font-weight="700" fill="#f4f5fb">${d.area}</text>`;
    return rect + num;
  });
  return `<svg class="patches-howto__demo" viewBox="0 0 4 4" aria-hidden="true">${parts.join('')}</svg>`;
}

/** Modal with the rules and a small static solved board; the shared modal handles closing and focus. */
export function openPatchesHowto(returnFocusTo: HTMLElement): void {
  const list = document.createElement('ul');
  for (const rule of RULES) {
    const li = document.createElement('li');
    li.textContent = rule;
    list.appendChild(li);
  }
  const body = document.createElement('div');
  body.className = 'patches-howto__body';
  body.append(list);
  body.insertAdjacentHTML('beforeend', demoSvg());
  openModal({ title: 'How to play', body: [body], returnFocus: returnFocusTo });
}
