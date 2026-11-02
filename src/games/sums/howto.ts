import { openModal } from '../../ui/modal';
import { sumsGrid } from './board';
import type { Cell, Puzzle } from './types';

const RULES = [
  'Strike out digits until every row and column adds up to its target.',
  'Strike a digit that belongs and you lose a life. You have 3.',
  'Long-press or right-click to mark a digit you want to keep. Marks are free.',
  'The small number under each target shows how much that line still has to lose.',
];

const SIZE = 3;
const DEMO_DIGITS = [2, 7, 4, 5, 1, 3, 8, 6, 2];
const DEMO_KEEP: (0 | 1)[] = [1, 0, 1, 0, 1, 1, 1, 1, 0];
/** Half solved: the 7 (cell 1) and the 5 (cell 3) are struck. */
const DEMO_CELLS: Cell[] = [0, 1, 0, 1, 0, 0, 0, 0, 0];

function demoPuzzle(): Puzzle {
  const kept = (r: number, c: number) => (DEMO_KEEP[r * SIZE + c] ? DEMO_DIGITS[r * SIZE + c] : 0);
  const idx = [0, 1, 2];
  const rows = idx.map((r) => idx.reduce((t, c) => t + kept(r, c), 0));
  const cols = idx.map((c) => idx.reduce((t, r) => t + kept(r, c), 0));
  return { size: SIZE, digits: DEMO_DIGITS, targets: [...rows, ...cols], solution: DEMO_KEEP };
}

/** Modal with the rules and a half-solved 3×3; the shared modal handles closing and focus. */
export function openSumsHowto(returnFocusTo: HTMLElement): void {
  const list = document.createElement('ul');
  for (const rule of RULES) {
    const li = document.createElement('li');
    li.textContent = rule;
    list.appendChild(li);
  }
  const demo = sumsGrid(demoPuzzle(), DEMO_CELLS);
  demo.classList.add('sums-howto__demo');
  const body = document.createElement('div');
  body.className = 'sums-howto__body';
  body.append(list, demo);
  openModal({ title: 'How to play', body: [body], returnFocus: returnFocusTo });
}
