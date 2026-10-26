/** Direction: 0 up, 1 right, 2 down, 3 left. */
export type Dir = 0 | 1 | 2 | 3;

/** Cells are flat indices `r * cols + c`, ordered tail → head. */
export type Arrow = { cells: number[]; dir: Dir; color: number };

export type Level = { cols: number; rows: number; arrows: Arrow[] };

export type LevelSpec = { cols: number; rows: number; maxLen: number; blockBias: number };

export type PresetId = 'medium' | 'hard' | 'huge';
export type Status = 'playing' | 'won' | 'lost';

export type GameState = {
  level: Level;
  /** 1 = arrow still on the board. */
  alive: Uint8Array;
  /** Cell → alive arrow index, -1 empty. */
  occ: Int32Array;
  lives: number;
  status: Status;
  /** Arrows remaining. */
  left: number;
};

export type TapResult =
  | { kind: 'ignored' }
  | { kind: 'exit'; arrow: number; distance: number }
  | { kind: 'bump'; arrow: number; blocker: number; distance: number };

/** Per-direction step as `[dc, dr]`, indexed by `Dir`. */
export const DIRS: readonly [dc: number, dr: number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
