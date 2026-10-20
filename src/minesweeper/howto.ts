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

let openDialog: (() => void) | null = null;

/** Modal listing the controls. Esc, ✕, "Got it" or the backdrop close it; focus returns to `returnFocusTo`. */
export function openMinesHowto(returnFocusTo: HTMLElement): void {
  openDialog?.();

  const backdrop = document.createElement('div');
  backdrop.className = 'mines-howto';
  const dlg = document.createElement('div');
  dlg.className = 'mines-howto__dialog glass';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-labelledby', 'mines-howto-title');

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn mines-howto__close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '✕';

  const title = document.createElement('h2');
  title.id = 'mines-howto-title';
  title.textContent = 'How to play';

  const intro = document.createElement('p');
  intro.className = 'text-2';
  intro.textContent = 'Clear every tile that is not a mine. Numbers count the mines touching a tile.';

  const list = document.createElement('ul');
  for (const [k, v] of CONTROLS) {
    const li = document.createElement('li');
    const b = document.createElement('strong');
    b.textContent = k;
    li.append(b, ` — ${v}`);
    list.appendChild(li);
  }

  const touch = document.createElement('p');
  touch.className = 'text-2';
  touch.textContent = TOUCH;

  const ok = document.createElement('button');
  ok.type = 'button';
  ok.className = 'btn btn--primary';
  ok.textContent = 'Got it';

  const body = document.createElement('div');
  body.className = 'mines-howto__body';
  body.append(list);
  body.insertAdjacentHTML('beforeend', CHORD_SVG);

  dlg.append(close, title, intro, body, touch, ok);
  backdrop.appendChild(dlg);
  document.body.appendChild(backdrop);

  const focusables = () => [...dlg.querySelectorAll<HTMLElement>('button')];

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
    } else if (e.key === 'Tab') {
      const f = focusables();
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function dismiss(): void {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    openDialog = null;
    returnFocusTo.focus();
  }

  close.addEventListener('click', dismiss);
  ok.addEventListener('click', dismiss);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) dismiss();
  });
  document.addEventListener('keydown', onKey);
  openDialog = dismiss;
  ok.focus();
}
