export type HeaderOptions = {
  /** Game name shown after the wordmark; omitted on the dashboard. */
  game?: string;
  /** Daily / Practice tabs (default true). The app owns their active state and the Practice href. */
  tabs?: boolean;
  /** Adds the "?" button when set. */
  onHelp?: () => void;
};

export type HeaderHandle = {
  el: HTMLElement;
  tabDaily: HTMLAnchorElement | null;
  tabPractice: HTMLAnchorElement | null;
  helpBtn: HTMLButtonElement | null;
};

function link(cls: string, href: string, text: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = cls;
  a.href = href;
  a.textContent = text;
  return a;
}

/** The site header shared by every page: home wordmark · game, mode tabs, help. */
export function createHeader(opts: HeaderOptions): HeaderHandle {
  const el = document.createElement('header');
  el.className = 'shell-header';

  const brand = document.createElement('div');
  brand.className = 'shell-brand';
  const home = link('wordmark', './index.html', 'puzzles');
  home.setAttribute('aria-label', 'puzzles — all games');
  brand.append(home);
  if (opts.game) {
    const sep = document.createElement('span');
    sep.className = 'shell-sep';
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = '·';
    const game = document.createElement('span');
    game.className = 'shell-game';
    game.setAttribute('aria-current', 'page');
    game.textContent = opts.game;
    brand.append(sep, game);
  }
  el.append(brand);

  let tabDaily: HTMLAnchorElement | null = null;
  let tabPractice: HTMLAnchorElement | null = null;
  if (opts.tabs !== false) {
    tabDaily = link('seg__item', '#/', 'Daily');
    tabPractice = link('seg__item', '#/practice', 'Practice');
    const nav = document.createElement('nav');
    nav.className = 'seg shell-tabs';
    nav.setAttribute('aria-label', 'Mode');
    nav.append(tabDaily, tabPractice);
    el.append(nav);
  }

  let helpBtn: HTMLButtonElement | null = null;
  if (opts.onHelp) {
    const onHelp = opts.onHelp;
    helpBtn = document.createElement('button');
    helpBtn.type = 'button';
    helpBtn.className = 'icon-btn shell-help';
    helpBtn.dataset.action = 'howto';
    helpBtn.setAttribute('aria-label', 'How to play');
    helpBtn.textContent = '?';
    helpBtn.addEventListener('click', () => onHelp());
    el.append(helpBtn);
  }

  return { el, tabDaily, tabPractice, helpBtn };
}
