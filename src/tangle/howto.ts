import { openModal } from '../ui/modal';

const RULES = [
  'Tap an arrow to slide it out of the board.',
  "It can't turn — it travels the way its head points.",
  'If another arrow is in the way it bumps back and you lose a ♥.',
  'You have 3 lives. Clear every arrow to win.',
];

/**
 * Two lanes on a 4×4 board: the top arrow slides out free; the bottom one bumps into a
 * blocker and slides back (blocker flashes). Animated with the CSS keyframes in tangle.css.
 */
const DEMO_SVG = `
<svg class="tangle-howto__demo" viewBox="0 0 4 4" aria-hidden="true">
  <rect x="0" y="0" width="4" height="4" rx=".3" fill="rgba(255,255,255,.06)"/>
  <g class="tangle-howto__free">
    <path d="M.5 1H2.3" fill="none" stroke="#34e3a0" stroke-width=".26" stroke-linecap="round"/>
    <polygon points="2.71,1 2.29,.79 2.29,1.21" fill="#34e3a0" stroke="#34e3a0" stroke-width=".06" stroke-linejoin="round"/>
  </g>
  <g class="tangle-howto__bump">
    <path d="M.5 3H1.3" fill="none" stroke="#4cb0ff" stroke-width=".26" stroke-linecap="round"/>
    <polygon points="1.71,3 1.29,2.79 1.29,3.21" fill="#4cb0ff" stroke="#4cb0ff" stroke-width=".06" stroke-linejoin="round"/>
    <g class="tangle-howto__flash">
      <path d="M.5 3H1.3" fill="none" stroke="#ff5c7a" stroke-width=".26" stroke-linecap="round"/>
      <polygon points="1.71,3 1.29,2.79 1.29,3.21" fill="#ff5c7a" stroke="#ff5c7a" stroke-width=".06" stroke-linejoin="round"/>
    </g>
  </g>
  <g class="tangle-howto__blocker">
    <path d="M3 3.5V2.3" fill="none" stroke="#ffd447" stroke-width=".26" stroke-linecap="round"/>
    <polygon points="3,1.89 2.79,2.31 3.21,2.31" fill="#ffd447" stroke="#ffd447" stroke-width=".06" stroke-linejoin="round"/>
    <g class="tangle-howto__flash">
      <path d="M3 3.5V2.3" fill="none" stroke="#ff5c7a" stroke-width=".26" stroke-linecap="round"/>
      <polygon points="3,1.89 2.79,2.31 3.21,2.31" fill="#ff5c7a" stroke="#ff5c7a" stroke-width=".06" stroke-linejoin="round"/>
    </g>
  </g>
</svg>`;

/** Modal with the rules and a small looping demo; the shared modal handles closing and focus. */
export function openTangleHowto(returnFocusTo: HTMLElement): void {
  const list = document.createElement('ul');
  for (const rule of RULES) {
    const li = document.createElement('li');
    li.textContent = rule;
    list.appendChild(li);
  }

  const body = document.createElement('div');
  body.className = 'tangle-howto__body';
  body.append(list);
  body.insertAdjacentHTML('beforeend', DEMO_SVG);

  openModal({ title: 'How to play', body: [body], returnFocus: returnFocusTo });
}
