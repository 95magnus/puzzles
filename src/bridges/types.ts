/** Bridges on one link: 0 none, 1 single, 2 double. */
export type Count = 0 | 1 | 2;

/** An island at flat cell `cell` that needs `n` bridges (1..8). */
export type Island = { cell: number; n: number };

/** A possible bridge between neighbouring islands `a < b` (`a` is left of / above `b`); `inner` are the cells strictly between them; `crosses` are the links that would cross this one. */
export type Link = { a: number; b: number; horizontal: boolean; inner: number[]; crosses: number[] };

/** `islands` are sorted by cell, `links` by (a, b); `islandLinks[i]` are the link indices at island `i`; `solution` holds one count per link. */
export type Puzzle = {
  size: number;
  islands: Island[];
  links: Link[];
  islandLinks: number[][];
  solution: Count[];
};

export type PresetId = 'small' | 'medium' | 'large';

/** A puzzle without its solution: what the solver and generator work on. */
export type Layout = Omit<Puzzle, 'solution'>;

export type Dir = 'up' | 'right' | 'down' | 'left';

/** One undoable action (a gesture or a Clear): the links it changed and their counts before. */
export type Move = { links: number[]; before: Count[] };

export type GameState = {
  puzzle: Puzzle;
  bridges: Count[];
  history: Move[];
  status: 'playing' | 'won';
};

/** Live rule breaks: islands over their number, and islands outside the largest component (only once every island is satisfied). */
export type Violations = { over: Set<number>; split: Set<number> };
