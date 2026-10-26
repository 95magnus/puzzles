import { PALETTE } from '../../ui/palette';
import { openModal } from '../../ui/modal';

const RULES = [
  'Place one ♛ in every row, every column and every colour.',
  "Queens can't touch — not even diagonally.",
  'Tap once for ✕, twice for ♛. Drag to mark many cells.',
  'Clashing queens turn red.',
];

/** The solved 4×4 used for the illustration (region ids per row) and its queen column per row. */
const DEMO_REGIONS = ['1022', '1222', '1333', '1333'];
const DEMO_SOLUTION = [1, 3, 0, 2];

function demoSvg(): string {
  const cells: string[] = [];
  DEMO_REGIONS.forEach((row, r) => {
    for (let c = 0; c < 4; c++) {
      const fill = PALETTE[Number(row[c])];
      cells.push(`<rect x="${c}" y="${r}" width="1" height="1" fill="${fill}" fill-opacity=".55" stroke="rgba(0,0,0,.45)" stroke-width=".02"/>`);
    }
  });
  const queens = DEMO_SOLUTION.map(
    (c, r) => `<text x="${c + 0.5}" y="${r + 0.5}" text-anchor="middle" dominant-baseline="central" font-size=".7" fill="#f4f5fb">♛</text>`,
  );
  return `<svg class="queens-howto__demo" viewBox="0 0 4 4" aria-hidden="true">${cells.join('')}${queens.join('')}</svg>`;
}

/** Modal with the rules and a small static solved board; the shared modal handles closing and focus. */
export function openQueensHowto(returnFocusTo: HTMLElement): void {
  const list = document.createElement('ul');
  for (const rule of RULES) {
    const li = document.createElement('li');
    li.textContent = rule;
    list.appendChild(li);
  }
  const body = document.createElement('div');
  body.className = 'queens-howto__body';
  body.append(list);
  body.insertAdjacentHTML('beforeend', demoSvg());
  openModal({ title: 'How to play', body: [body], returnFocus: returnFocusTo });
}
