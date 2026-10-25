/** A cell's content: 0 empty, 1 dot, 2 ring. */
export type Sym = 0 | 1 | 2;

/** An `=` (eq) or `×` (neq) clue between orthogonal neighbours `a < b`. */
export type Edge = { a: number; b: number; kind: 'eq' | 'neq' };

/** `givens` and `solution` hold one entry per cell; `givens` is 0 where not given; `edges` are sorted by (a, b). */
export type Puzzle = { size: number; givens: Sym[]; edges: Edge[]; solution: Sym[] };

export type PresetId = 'small' | 'medium' | 'large';

/** One undoable action: the cells it changed and their values before. */
export type Move = { cells: number[]; before: Sym[] };

export type GameState = {
  puzzle: Puzzle;
  cells: Sym[];
  history: Move[];
  status: 'playing' | 'won';
};

/** Live rule breaks: cells in a run of three or more, line ids over the balance limit, indices into `puzzle.edges`. */
export type Violations = { triples: Set<number>; lines: Set<number>; edges: Set<number> };
