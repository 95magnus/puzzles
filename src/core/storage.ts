import type { Cell } from './types';

export type DailySave = { v: 1; date: string; paths: Cell[][]; elapsedMs: number; solved: boolean };
type FlagName = 'howto-seen' | 'colorblind' | 'mines-howto-seen';

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

export type MinesStatus = 'playing' | 'won' | 'lost';
export type MinesPreset = 'classic' | 'expert' | 'huge';
/** `cells` is one char per cell: h(idden) / r(evealed) / f(lagged). The board itself is regenerated from the date. */
export type MinesDailySave = { v: 1; date: string; cells: string; elapsedMs: number; status: MinesStatus };

const MINES_DAILY_KEY = 'mines:daily';
const MINES_PRESET_KEY = 'mines:preset';
const MINES_STATUSES: readonly string[] = ['playing', 'won', 'lost'];
const MINES_PRESETS: readonly string[] = ['classic', 'expert', 'huge'];

/** Shape check only; whether the cells fit today's board is `restoreGame`'s job. */
export function loadMinesDaily(date: string): MinesDailySave | null {
  try {
    const raw = localStorage.getItem(MINES_DAILY_KEY);
    if (raw === null) return null;
    const o = JSON.parse(raw) as MinesDailySave | null;
    if (typeof o !== 'object' || o === null) return null;
    if (o.v !== 1 || typeof o.date !== 'string' || o.date !== date) return null;
    if (typeof o.cells !== 'string' || !/^[hrf]*$/.test(o.cells)) return null;
    if (typeof o.elapsedMs !== 'number' || !(o.elapsedMs >= 0)) return null;
    if (!MINES_STATUSES.includes(o.status)) return null;
    return { v: 1, date: o.date, cells: o.cells, elapsedMs: o.elapsedMs, status: o.status };
  } catch {
    return null;
  }
}

export function saveMinesDaily(save: Omit<MinesDailySave, 'v'>): void {
  try {
    localStorage.setItem(MINES_DAILY_KEY, JSON.stringify({ v: 1, ...save }));
  } catch {
    /* storage unavailable */
  }
}

export function getMinesPreset(): MinesPreset | null {
  try {
    const v = localStorage.getItem(MINES_PRESET_KEY);
    return v !== null && MINES_PRESETS.includes(v) ? (v as MinesPreset) : null;
  } catch {
    return null;
  }
}

export function setMinesPreset(id: MinesPreset): void {
  try {
    localStorage.setItem(MINES_PRESET_KEY, id);
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
