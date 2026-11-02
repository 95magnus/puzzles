import type { Puzzle } from '../../../src/games/sums/types';

/** Builds a puzzle from digits and a keep mask; each line's target is the sum of its kept digits. */
export function puzzle(size: number, digits: number[], keep: (0 | 1)[]): Puzzle {
  const targets: number[] = [];
  for (let r = 0; r < size; r++) {
    let t = 0;
    for (let c = 0; c < size; c++) if (keep[r * size + c]) t += digits[r * size + c];
    targets.push(t);
  }
  for (let c = 0; c < size; c++) {
    let t = 0;
    for (let r = 0; r < size; r++) if (keep[r * size + c]) t += digits[r * size + c];
    targets.push(t);
  }
  return { size, digits, targets, solution: keep };
}

/** Every keep mask that meets all targets, by plain backtracking (independent of the solver under test). */
export function allSolutions(size: number, digits: number[], targets: number[]): (0 | 1)[][] {
  const n = size * size;
  const out: (0 | 1)[][] = [];
  const mask: (0 | 1)[] = new Array(n).fill(0);
  const sums = new Array(2 * size).fill(0);
  const rec = (i: number): void => {
    if (i === n) {
      if (sums.every((s, l) => s === targets[l])) out.push(mask.slice());
      return;
    }
    const r = Math.floor(i / size);
    const c = i % size;
    for (const v of [0, 1] as const) {
      mask[i] = v;
      if (v) {
        sums[r] += digits[i];
        sums[size + c] += digits[i];
      }
      if (sums[r] <= targets[r] && sums[size + c] <= targets[size + c]) rec(i + 1);
      if (v) {
        sums[r] -= digits[i];
        sums[size + c] -= digits[i];
      }
    }
  };
  rec(0);
  return out;
}
