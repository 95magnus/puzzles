export type Cell = { r: number; c: number };
export type Pair = { color: number; a: Cell; b: Cell };
export type Puzzle = { size: number; pairs: Pair[] };
