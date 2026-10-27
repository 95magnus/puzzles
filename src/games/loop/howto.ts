import { openModal } from '../../ui/modal';
import { loopSvg } from './board';
import { hEdge, vEdge } from './geometry';

const RULES = [
  'Draw one closed loop along the dotted lines.',
  "Each number says how many of its cell's four sides the loop uses.",
  'The loop never branches or crosses itself.',
  'Tap an edge to cycle line, ✕ and empty. Drag across dots to draw or erase. Right-click places ✕.',
];

const DEMO_SIZE = 3;
const DEMO_CLUES = [2, null, null, null, 2, 1, null, 1, 0];
/** The outline of the 2×2 block at the top left. */
const DEMO_LINES = [
  hEdge(DEMO_SIZE, 0, 0),
  hEdge(DEMO_SIZE, 0, 1),
  hEdge(DEMO_SIZE, 2, 0),
  hEdge(DEMO_SIZE, 2, 1),
  vEdge(DEMO_SIZE, 0, 0),
  vEdge(DEMO_SIZE, 1, 0),
  vEdge(DEMO_SIZE, 0, 2),
  vEdge(DEMO_SIZE, 1, 2),
];

/** Modal with the rules and a small solved board; the shared modal handles closing and focus. */
export function openLoopHowto(returnFocusTo: HTMLElement): void {
  const list = document.createElement('ul');
  for (const rule of RULES) {
    const li = document.createElement('li');
    li.textContent = rule;
    list.appendChild(li);
  }
  const demo = loopSvg(DEMO_SIZE, DEMO_CLUES, DEMO_LINES);
  demo.classList.add('loop-howto__demo');
  const body = document.createElement('div');
  body.className = 'loop-howto__body';
  body.append(list, demo);
  openModal({ title: 'How to play', body: [body], returnFocus: returnFocusTo });
}
