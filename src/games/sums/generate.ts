import { mulberry32, randInt, seedFromString, type Rng } from '../../core/rng';
import { deduce, lineCells } from './solver';
import type { PresetId, Puzzle } from './types';

export const PRESETS: Record<PresetId, { size: number; label: string }> = {
  easy: { size: 5, label: 'Easy' },
  medium: { size: 7, label: 'Medium' },
  hard: { size: 9, label: 'Hard' },
};

export const DAILY_PRESET: PresetId = 'medium';

const MIN_SIZE = 5;
const MAX_SIZE = 9;
const MAX_ATTEMPTS = 2000;
const KEEP_PROBABILITY = 0.55;

export function sumsDailySeed(isoDate: string): number {
  return seedFromString('sums-daily:' + isoDate);
}

function attempt(size: number, rng: Rng): Puzzle | null {
  const n = size * size;
  const digits = Array.from({ length: n }, () => 1 + randInt(rng, 9));
  const solution = Array.from({ length: n }, (): 0 | 1 => (rng() < KEEP_PROBABILITY ? 1 : 0));
  const lines = lineCells(size);
  const targets: number[] = [];
  for (const cells of lines) {
    let kept = 0;
    let sum = 0;
    for (const c of cells) {
      if (solution[c]) {
        kept++;
        sum += digits[c];
      }
    }
    if (kept === 0 || kept === size) return null;
    targets.push(sum);
  }
  const found = deduce(size, digits, targets);
  if (!found || !found.every((v, i) => v === solution[i])) return null;
  return { size, digits, targets, solution };
}

export function generatePuzzle(size: number, seed: number): Puzzle {
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) throw new Error(`Unsupported Sums size ${size}`);
  const rng = mulberry32(seed);
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const puzzle = attempt(size, rng);
    if (puzzle) return puzzle;
  }
  throw new Error(`Could not generate a ${size}x${size} Sums board for seed ${seed}`);
}
