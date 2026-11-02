/** A generated board. Cells are `r * size + c`; `solution[i]` is 1 for a kept digit, 0 for a struck one. */
export type Puzzle = { size: number; digits: number[]; targets: number[]; solution: (0 | 1)[] };

/** 0 open, 1 struck, 2 marked, 3 locked. Marked counts as open for every rule. */
export type Cell = 0 | 1 | 2 | 3;

export type Status = 'playing' | 'won' | 'lost';

export type GameState = { puzzle: Puzzle; cells: Cell[]; lives: number; status: Status; left: number };

export type PresetId = 'easy' | 'medium' | 'hard';
