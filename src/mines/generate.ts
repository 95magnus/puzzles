import { randInt, seedFromString, shuffle, type Rng } from '../core/rng';
import type { Board, BoardSpec, PresetId } from './types';

export const PRESETS: Record<PresetId, BoardSpec & { label: string }> = {
  classic: { cols: 30, rows: 16, mines: 99, label: 'Classic' },
  expert: { cols: 30, rows: 20, mines: 130, label: 'Expert+' },
  huge: { cols: 50, rows: 30, mines: 320, label: 'Huge' },
};

export const DAILY_PRESET: PresetId = 'expert';

export function minesDailySeed(isoDate: string): number {
  return seedFromString('mines-daily:' + isoDate);
}

/** In-bounds 8-neighbourhood of cell `i`, ascending. */
export function neighbours(cols: number, rows: number, i: number): number[] {
  const r = Math.floor(i / cols);
  const c = i % cols;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.push(rr * cols + cc);
    }
  }
  return out;
}

/**
 * Deterministic for a given (spec, rng stream, start). The start cell and its neighbours are
 * mine-free; the daily picks the start from the rng, practice passes the player's first click.
 */
export function generateBoard(spec: BoardSpec, rng: Rng, startCell?: number): Board {
  const { cols, rows, mines: count } = spec;
  const n = cols * rows;
  const start = startCell ?? randInt(rng, n);
  const safe = new Set([start, ...neighbours(cols, rows, start)]);
  const candidates: number[] = [];
  for (let i = 0; i < n; i++) if (!safe.has(i)) candidates.push(i);
  if (count > candidates.length) {
    throw new RangeError(`${count} mines do not fit on a ${cols}×${rows} board`);
  }
  shuffle(rng, candidates);

  const mines = new Uint8Array(n);
  for (let k = 0; k < count; k++) mines[candidates[k]] = 1;
  const adj = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!mines[i]) continue;
    for (const j of neighbours(cols, rows, i)) adj[j]++;
  }
  return { cols, rows, mines, adj, start };
}
