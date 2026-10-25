import { openModal } from '../ui/modal';
import { symbolSvg } from './board';

const RULES = [
  'Fill every cell with a ● or a ○.',
  'Each row and column has the same number of each.',
  'No more than two of the same next to each other.',
  '= means the two cells match. × means they differ.',
  'Tap a cell to cycle ●, ○, empty. Right-click places a ○.',
  'Broken rules turn red.',
];

/** The solved 4×4 used for the illustration (S = dot, M = ring), with an `=` on cells 0–1 and a `×` on cells 1–5. */
const DEMO = 'SSMM' + 'MMSS' + 'SMMS' + 'MSSM';
const DEMO_EDGES: { a: number; b: number; text: string }[] = [
  { a: 0, b: 1, text: '=' },
  { a: 1, b: 5, text: '×' },
];

/** A small inert board built from the same classes as the real one, so it looks identical. */
function demoEl(): HTMLElement {
  const n = 4;
  const grid = document.createElement('div');
  grid.className = 'balanced-grid balanced-howto__demo';
  grid.style.setProperty('--n', String(n));
  grid.setAttribute('aria-hidden', 'true');
  for (const ch of DEMO) {
    const c = document.createElement('div');
    c.className = 'balanced-cell';
    c.appendChild(symbolSvg(ch === 'S' ? 1 : 2));
    grid.appendChild(c);
  }
  const edges = document.createElement('div');
  edges.className = 'balanced-edges';
  for (const e of DEMO_EDGES) {
    const b = document.createElement('div');
    b.className = 'balanced-edge ' + (e.b === e.a + 1 ? 'is-h' : 'is-v');
    b.textContent = e.text;
    b.style.setProperty('--r', String(Math.floor(e.a / n)));
    b.style.setProperty('--c', String(e.a % n));
    edges.appendChild(b);
  }
  grid.appendChild(edges);
  return grid;
}

/** Modal with the rules and a small solved board; the shared modal handles closing and focus. */
export function openBalancedHowto(returnFocusTo: HTMLElement): void {
  const list = document.createElement('ul');
  for (const rule of RULES) {
    const li = document.createElement('li');
    li.textContent = rule;
    list.appendChild(li);
  }
  const body = document.createElement('div');
  body.className = 'balanced-howto__body';
  body.append(list, demoEl());
  openModal({ title: 'How to play', body: [body], returnFocus: returnFocusTo });
}
