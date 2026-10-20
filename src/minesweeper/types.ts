export type BoardSpec = { cols: number; rows: number; mines: number };

/** Cells are flat indices: `r * cols + c`. */
export type Board = {
  cols: number;
  rows: number;
  /** 1 = mine. */
  mines: Uint8Array;
  /** Adjacent mine count, 0–8. */
  adj: Uint8Array;
  /** Pre-revealed start cell; always a zero. */
  start: number;
};

/** 0 = hidden, 1 = revealed, 2 = flagged. */
export type CellState = 0 | 1 | 2;
export type Status = 'playing' | 'won' | 'lost';

export type GameState = {
  board: Board;
  cells: Uint8Array;
  status: Status;
  /** Revealed safe cells. */
  revealed: number;
  flags: number;
  /** Index of the mine that ended the game, or -1. */
  explodedAt: number;
};

export type PresetId = 'classic' | 'expert' | 'huge';
