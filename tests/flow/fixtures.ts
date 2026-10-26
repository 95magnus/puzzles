import type { Cell, Puzzle } from '../../src/flow/types';

const cells = (pts: [number, number][]): Cell[] => pts.map(([r, c]) => ({ r, c }));

/** Solution paths of P5x5_unique; index = color, each path runs pairs[i].a -> pairs[i].b. */
export const P5x5_solution: Cell[][] = [
  cells([[0, 1], [0, 0], [1, 0], [2, 0], [2, 1], [3, 1]]),
  cells([[1, 1], [1, 2], [0, 2], [0, 3], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4]]),
  cells([[1, 3], [2, 3], [3, 3], [4, 3]]),
  cells([[2, 2], [3, 2], [4, 2], [4, 1], [4, 0], [3, 0]]),
];

/** 5x5 puzzle verified unique by brute force under the non-self-touching rule. */
export const P5x5_unique: Puzzle = {
  size: 5,
  pairs: P5x5_solution.map((path, color) => ({
    color,
    a: path[0],
    b: path[path.length - 1],
  })),
};
