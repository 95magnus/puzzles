import { neighbours } from '../../src/mines/generate';
import type { Board } from '../../src/mines/types';

/** Build a board from ASCII rows: `*` = mine, `.` = safe. */
export function boardFrom(rows: string[], start: [number, number]): Board {
  const cols = rows[0].length;
  const n = cols * rows.length;
  const mines = new Uint8Array(n);
  rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '*') mines[r * cols + c] = 1; }));
  const adj = new Uint8Array(n);
  for (let i = 0; i < n; i++) adj[i] = neighbours(cols, rows.length, i).filter((j) => mines[j]).length;
  return { cols, rows: rows.length, mines, adj, start: start[0] * cols + start[1] };
}
