/** Cell mark: 0 empty, 1 ✕, 2 queen. */
export type Mark = 0 | 1 | 2;

/** `regions[r * size + c]` is the region id (0..size-1); `solution[r]` is the queen column of row r. */
export type Puzzle = { size: number; regions: Uint8Array; solution: number[] };

export type PresetId = 'small' | 'medium' | 'large';

/** One undoable action: the cells it touched and their marks beforehand. */
export type Move = { cells: number[]; before: Mark[]; gesture?: number };

export type GameState = {
  puzzle: Puzzle;
  cells: Uint8Array;
  history: Move[];
  status: 'playing' | 'won';
};
