/** One grid edge: 0 unknown, 1 line, 2 marked as not a line (an ✕). */
export type Edge = 0 | 1 | 2;

/** `clues[cell]` is how many of the cell's sides are lines, or null; `solution` holds 0 or 1 per edge. */
export type Puzzle = { size: number; clues: (number | null)[]; solution: (0 | 1)[] };

export type PresetId = 'small' | 'medium' | 'large';

/** One undoable action (a gesture or a Clear): the edges it changed and their values before. */
export type Move = { edges: number[]; before: Edge[] };

export type GameState = {
  puzzle: Puzzle;
  edges: Edge[];
  history: Move[];
  status: 'playing' | 'won';
};

/** Live rule breaks: clue cells with too many lines (or too few to ever reach their number), and dots with a dead end or a branch. */
export type Violations = { clues: Set<number>; dots: Set<number> };

/** What a drag does to the edges it crosses. */
export type PaintMode = 'draw' | 'erase';
