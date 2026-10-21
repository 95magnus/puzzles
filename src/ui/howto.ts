import { setFlag } from '../core/storage';
import { openModal } from './modal';
import { GLYPHS, PALETTE } from './palette';

export type HowtoOptions = {
  colorblind: boolean;
  onColorblindChange: (on: boolean) => void;
  /** Element to refocus on close (defaults to the header "?" button). */
  returnFocus?: HTMLElement | null;
};

const NS = 'http://www.w3.org/2000/svg';

function s(tag: string, attrs: Record<string, string | number>, ...kids: SVGElement[]): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  e.append(...kids);
  return e;
}

/** Tiny 4x2-cell grid; `body` adds the step-specific (animated) paths and dots. */
function demo(label: string, ...body: SVGElement[]): SVGSVGElement {
  const svg = s('svg', { class: 'howto-demo', viewBox: '0 0 120 60', role: 'img', 'aria-label': label }) as SVGSVGElement;
  svg.append(s('rect', { x: 0.5, y: 0.5, width: 119, height: 59, rx: 10, class: 'howto-demo__bg' }));
  for (const x of [30, 60, 90]) svg.append(s('line', { x1: x, y1: 4, x2: x, y2: 56, class: 'howto-demo__grid' }));
  svg.append(s('line', { x1: 4, y1: 30, x2: 116, y2: 30, class: 'howto-demo__grid' }));
  svg.append(...body);
  return svg;
}

const dot = (cx: number, cy: number, color: string) => s('circle', { cx, cy, r: 7, fill: color });
const path = (d: string, color: string, cls = 'howto-path') =>
  s('path', { d, stroke: color, class: cls, pathLength: 1, fill: 'none' });

const STEPS: { text: string; svg: () => SVGSVGElement }[] = [
  {
    text: 'Drag from a dot to its match.',
    svg: () =>
      demo(
        'A path drawn from one pink dot to the other',
        path('M15 15 H75 V45 H105', PALETTE[0]),
        dot(15, 15, PALETTE[0]),
        dot(105, 45, PALETTE[0]),
      ),
  },
  {
    text: "Paths can't cross.",
    svg: () =>
      demo(
        'A second path is blocked from crossing the first',
        path('M15 15 H105', PALETTE[1]),
        path('M60 45 H105', PALETTE[2]),
        path('M60 45 V15', PALETTE[2], 'howto-path howto-path--blocked'),
        dot(15, 15, PALETTE[1]),
        dot(105, 15, PALETTE[1]),
        dot(60, 45, PALETTE[2]),
        dot(105, 45, PALETTE[2]),
      ),
  },
  {
    text: 'Fill every cell to win.',
    svg: () =>
      demo(
        'Two paths that together cover every cell',
        path('M15 15 H105 V30', PALETTE[3]),
        path('M15 45 H105', PALETTE[4]),
        dot(15, 15, PALETTE[3]),
        dot(105, 30, PALETTE[3]),
        dot(15, 45, PALETTE[4]),
        dot(105, 45, PALETTE[4]),
      ),
  },
];

export function openHowto(opts: HowtoOptions): void {
  const returnTo = opts.returnFocus ?? document.querySelector<HTMLElement>('[data-action="howto"]');
  setFlag('howto-seen', true);

  const list = document.createElement('ol');
  list.className = 'howto-steps';
  STEPS.forEach((st, i) => {
    const li = document.createElement('li');
    li.className = 'howto-step';
    const n = document.createElement('span');
    n.className = 'howto-step__n num';
    n.setAttribute('aria-hidden', 'true');
    n.textContent = String(i + 1);
    const p = document.createElement('p');
    p.textContent = st.text;
    li.append(st.svg(), n, p);
    list.append(li);
  });

  let on = opts.colorblind;
  const sw = document.createElement('button');
  sw.type = 'button';
  sw.className = 'switch';
  sw.setAttribute('role', 'switch');
  sw.setAttribute('aria-checked', String(on));
  sw.setAttribute('aria-labelledby', 'howto-cb-label');
  const thumb = document.createElement('span');
  thumb.className = 'switch__thumb';
  sw.append(thumb);
  const label = document.createElement('span');
  label.id = 'howto-cb-label';
  label.textContent = 'Colorblind mode';
  const hint = document.createElement('span');
  hint.className = 'text-2 howto-cb__hint';
  hint.textContent = `Adds a shape to each dot: ${GLYPHS.slice(0, 4).join(' ')} …`;
  const labels = document.createElement('div');
  labels.className = 'howto-cb__text';
  labels.append(label, hint);
  const cb = document.createElement('div');
  cb.className = 'howto-cb';
  cb.append(labels, sw);
  sw.addEventListener('click', () => {
    on = !on;
    sw.setAttribute('aria-checked', String(on));
    setFlag('colorblind', on);
    opts.onColorblindChange(on);
  });

  openModal({ title: 'How to play', body: [list, cb], returnFocus: returnTo });
}
