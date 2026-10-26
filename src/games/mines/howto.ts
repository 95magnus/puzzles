import { openModal } from '../../ui/modal';

const CONTROLS: [string, string][] = [
  ['Left click', 'reveal a tile'],
  ['Right click', 'flag a tile'],
  ['Left + right', 'reveal all unflagged tiles around a number whose flags match it'],
];
const TOUCH = 'Tap — reveal · Long-press — flag · Tap a number — reveal around it';

/** A "2" with both mines flagged: chording opens the three remaining tiles. */
const CHORD_SVG = `
<svg class="mines-howto__demo" viewBox="0 0 76 76" aria-hidden="true">
  <g fill="rgba(255,255,255,.12)">
    <rect x="2" y="2" width="22" height="22" rx="4"/><rect x="27" y="2" width="22" height="22" rx="4"/>
    <rect x="52" y="2" width="22" height="22" rx="4"/><rect x="2" y="27" width="22" height="22" rx="4"/>
    <rect x="52" y="27" width="22" height="22" rx="4"/><rect x="2" y="52" width="22" height="22" rx="4"/>
    <rect x="27" y="52" width="22" height="22" rx="4"/><rect x="52" y="52" width="22" height="22" rx="4"/>
  </g>
  <rect x="27" y="27" width="22" height="22" rx="4" fill="rgba(0,0,0,.3)"/>
  <text x="38" y="43" text-anchor="middle" font-size="15" font-weight="700" fill="#34e3a0">2</text>
  <g><path d="M9 6v14" stroke="#eef0f7" stroke-width="1.6"/><path d="M9.6 6.4 18 9.7 9.6 13z" fill="#ffd447"/></g>
  <g><path d="M59 56v14" stroke="#eef0f7" stroke-width="1.6"/><path d="M59.6 56.4 68 59.7 59.6 63z" fill="#ffd447"/></g>
  <g fill="rgba(255,255,255,.04)" stroke="#4cb0ff" stroke-width="1.2" stroke-dasharray="2 2">
    <rect x="27.5" y="2.5" width="21" height="21" rx="4"/><rect x="52.5" y="2.5" width="21" height="21" rx="4"/>
    <rect x="2.5" y="27.5" width="21" height="21" rx="4"/>
  </g>
</svg>`;

/** Modal listing the controls; the shared modal handles closing and focus. */
export function openMinesHowto(returnFocusTo: HTMLElement): void {
  const intro = document.createElement('p');
  intro.className = 'text-2 mines-howto__intro';
  intro.textContent = 'Clear every tile that is not a mine. Numbers count the mines touching a tile.';

  const list = document.createElement('ul');
  for (const [k, v] of CONTROLS) {
    const li = document.createElement('li');
    const b = document.createElement('strong');
    b.textContent = k;
    li.append(b, ` — ${v}`);
    list.appendChild(li);
  }

  const body = document.createElement('div');
  body.className = 'mines-howto__body';
  body.append(list);
  body.insertAdjacentHTML('beforeend', CHORD_SVG);

  const touch = document.createElement('p');
  touch.className = 'text-2 mines-howto__touch';
  touch.textContent = TOUCH;

  openModal({ title: 'How to play', body: [intro, body, touch], returnFocus: returnFocusTo });
}
