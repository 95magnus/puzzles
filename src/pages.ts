/**
 * Every page Vite builds, as id → HTML file at the project root. vite.config.ts builds from this
 * and the dashboard (home/puzzles.ts) links to it, so adding a puzzle starts here.
 */
export const PAGES = {
  home: 'index.html',
  flow: 'flow.html',
  mines: 'mines.html',
  tangle: 'tangle.html',
  queens: 'queens.html',
  patches: 'patches.html',
  balanced: 'balanced.html',
  bridges: 'bridges.html',
  loop: 'loop.html',
} as const;

export type GameId = Exclude<keyof typeof PAGES, 'home'>;
