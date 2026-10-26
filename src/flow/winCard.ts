import { formatCountdown } from '../core/daily';
import { formatClock } from '../ui/hud';

export type WinCardOptions = {
  timeMs: number;
  mode: 'daily' | 'practice';
  countdownMs?: number;
  onPrimary: () => void;
};

export type WinCardHandle = {
  show(opts: WinCardOptions): void;
  /** Update the "Next daily in" countdown without replaying the entrance. */
  setCountdown(ms: number): void;
  hide(): void;
};

let instance = 0;

export function createWinCard(el: HTMLElement): WinCardHandle {
  const id = `win-${++instance}`;
  const card = document.createElement('section');
  card.className = 'end-card glass';
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', `${id}-title`);

  const title = document.createElement('h2');
  title.className = 'end-card__title';
  title.id = `${id}-title`;
  title.textContent = 'Solved ✦';

  const time = document.createElement('p');
  time.className = 'end-card__stat num';

  const next = document.createElement('p');
  next.className = 'end-card__next text-2 num';
  const countdown = document.createElement('span');
  next.append('Next daily in ', countdown);

  const primary = document.createElement('button');
  primary.type = 'button';
  primary.className = 'btn btn--primary';

  const actions = document.createElement('div');
  actions.className = 'end-card__actions';
  actions.append(primary);

  card.append(title, time, next, actions);
  el.append(card);

  let onPrimary: (() => void) | null = null;
  primary.addEventListener('click', () => onPrimary?.());

  return {
    show(opts) {
      onPrimary = opts.onPrimary;
      time.textContent = formatClock(opts.timeMs);
      const daily = opts.mode === 'daily';
      if (daily) {
        countdown.textContent = formatCountdown(opts.countdownMs ?? 0);
        if (next.parentNode !== card) card.insertBefore(next, actions);
      } else {
        next.remove();
      }
      primary.textContent = daily ? 'Play practice' : 'Next puzzle';
      card.hidden = false;
      try {
        primary.focus({ preventScroll: true });
      } catch {
        /* focus unsupported */
      }
    },
    setCountdown(ms) {
      const text = formatCountdown(ms);
      if (countdown.textContent !== text) countdown.textContent = text;
    },
    hide() {
      card.hidden = true;
      onPrimary = null;
    },
  };
}
