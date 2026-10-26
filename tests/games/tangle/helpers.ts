import type { Dir, Level } from '../../../src/games/tangle/types';

/** Build a level from `[r, c]` cell lists (tail → head) and directions. Colour 0 for all. */
export function lvl(
  cols: number,
  rows: number,
  arrows: [cells: [r: number, c: number][], dir: Dir][],
): Level {
  return {
    cols,
    rows,
    arrows: arrows.map(([cells, dir]) => ({
      cells: cells.map(([r, c]) => r * cols + c),
      dir,
      color: 0,
    })),
  };
}
