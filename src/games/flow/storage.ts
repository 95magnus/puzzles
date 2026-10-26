import { dailyStore } from '../../core/storage';
import type { Cell } from './types';

export type DailySave = { v: 1; date: string; paths: Cell[][]; elapsedMs: number; solved: boolean };

function isCell(x: unknown): x is Cell {
  const o = x as Cell | null;
  return typeof o === 'object' && o !== null && Number.isInteger(o.r) && Number.isInteger(o.c);
}

export const { load: loadDaily, save: saveDaily } = dailyStore<DailySave>('flow:daily', (o) => {
  if (!Array.isArray(o.paths) || !o.paths.every((p) => Array.isArray(p) && p.every(isCell))) return null;
  if (typeof o.elapsedMs !== 'number' || typeof o.solved !== 'boolean') return null;
  return { v: 1, date: o.date, paths: o.paths, elapsedMs: o.elapsedMs, solved: o.solved };
});
