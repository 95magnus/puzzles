/** What a clue demands of its rectangle: a square, a wide (w > h) or tall (h > w) one, or anything. */
export type Shape = 'square' | 'wide' | 'tall' | 'any';

/** `cell` is the clue's board index; `area` is omitted when the clue shows no number; `color` indexes the palette. */
export type Clue = { cell: number; shape: Shape; area?: number; color: number };

/** Top-left corner (r, c) plus width and height, in cells. */
export type Rect = { r: number; c: number; w: number; h: number };

/** `clues` are sorted by cell; `solution[i]` is the rectangle belonging to `clues[i]`. */
export type Puzzle = { size: number; clues: Clue[]; solution: Rect[] };

export type PresetId = 'small' | 'medium' | 'large';

/** One undoable action: the rectangles it added and the ones it removed. */
export type Move = { added: Rect[]; removed: Rect[] };

export type GameState = {
  puzzle: Puzzle;
  rects: Rect[];
  history: Move[];
  status: 'playing' | 'won';
};
