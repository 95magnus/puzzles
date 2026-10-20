import type { Cell } from './types';

export type DailySave = { v: 1; date: string; paths: Cell[][]; elapsedMs: number; solved: boolean };
type FlagName = 'howto-seen' | 'colorblind';

const DAILY_KEY = 'flow:daily';

function isCell(x: unknown): x is Cell {
  const o = x as Cell | null;
  return typeof o === 'object' && o !== null && Number.isInteger(o.r) && Number.isInteger(o.c);
}

export function loadDaily(date: string): DailySave | null {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (raw === null) return null;
    const o = JSON.parse(raw) as DailySave | null;
    if (typeof o !== 'object' || o === null) return null;
    if (o.v !== 1 || typeof o.date !== 'string' || o.date !== date) return null;
    if (!Array.isArray(o.paths) || !o.paths.every((p) => Array.isArray(p) && p.every(isCell))) return null;
    if (typeof o.elapsedMs !== 'number' || typeof o.solved !== 'boolean') return null;
    return { v: 1, date: o.date, paths: o.paths, elapsedMs: o.elapsedMs, solved: o.solved };
  } catch {
    return null;
  }
}

export function saveDaily(save: Omit<DailySave, 'v'>): void {
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify({ v: 1, ...save }));
  } catch {
    /* storage unavailable */
  }
}

export function getFlag(name: FlagName): boolean {
  try {
    return localStorage.getItem('flow:flag:' + name) === '1';
  } catch {
    return false;
  }
}

export function setFlag(name: FlagName, value: boolean): void {
  try {
    localStorage.setItem('flow:flag:' + name, value ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}
