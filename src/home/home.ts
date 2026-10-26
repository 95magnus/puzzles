import { dailyNumber, formatCountdown, formatDailyLabel, msUntilNextUtcMidnight, utcDateString } from '../core/daily';
import { createHeader } from '../ui/header';
import { PUZZLES, statusLabel, type PuzzleEntry } from './puzzles';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function link(cls: string, href: string, text: string): HTMLAnchorElement {
  const a = el('a', cls, text);
  a.href = href;
  return a;
}

type Card = { entry: PuzzleEntry; pill: HTMLElement; li: HTMLLIElement };

function createCard(entry: PuzzleEntry): Card {
  const li = el('li', 'puzzle-card glass');
  li.dataset.id = entry.id;
  try {
    li.append(entry.preview());
  } catch {
    /* a broken preview must not take the card down */
  }
  const body = el('div', 'puzzle-card__body');
  const pill = el('span', 'status-pill num');
  body.append(el('h2', 'puzzle-card__name', entry.name), el('p', 'puzzle-card__tagline text-2', entry.tagline));
  if (entry.bestOnComputer) body.append(el('p', 'puzzle-card__phone-note', 'Best played on a computer'));
  body.append(pill);
  const actions = el('div', 'puzzle-card__actions');
  actions.append(link('btn btn--primary', `${entry.href}#/`, 'Play daily'), link('btn', `${entry.href}#/practice`, 'Practice'));
  li.append(body, actions);
  return { entry, pill, li };
}

/** Mount the dashboard into `root`. Returns an unmount function. */
export function mountHome(root: HTMLElement, deps: { now?: () => Date } = {}): () => void {
  const now = deps.now ?? (() => new Date());

  const header = createHeader({ tabs: false });
  const intro = el('p', 'home-intro num');
  const next = el('p', 'home-next text-2 num');
  const grid = el('ul', 'home-grid');
  const cards = PUZZLES.map(createCard);
  grid.append(...cards.map(c => c.li));
  const main = el('main', 'home');
  main.append(intro, next, grid);
  root.replaceChildren(header.el, main);

  let date = '';

  function renderDay(): void {
    date = utcDateString(now());
    intro.textContent = `Daily #${dailyNumber(date)} · ${formatDailyLabel(date)}`;
    renderStatuses();
  }

  function renderStatuses(): void {
    for (const { entry, pill } of cards) {
      const s = entry.dailyStatus(date);
      pill.dataset.status = s.kind;
      pill.textContent = statusLabel(entry, s);
    }
  }

  function tick(): void {
    const t = now();
    if (utcDateString(t) !== date) renderDay();
    next.textContent = `Next daily in ${formatCountdown(msUntilNextUtcMidnight(t))}`;
  }

  function onVisible(): void {
    if (document.visibilityState !== 'hidden') renderStatuses();
  }

  tick();
  const interval = setInterval(tick, 1000);
  window.addEventListener('storage', renderStatuses);
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    clearInterval(interval);
    window.removeEventListener('storage', renderStatuses);
    document.removeEventListener('visibilitychange', onVisible);
    root.replaceChildren();
  };
}
