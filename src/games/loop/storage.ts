import { dailyStore, presetStore } from '../../core/storage';
import type { PresetId } from './types';

/** `edges` is one char per grid edge: 0 unknown, 1 line, 2 ✕. The puzzle itself is regenerated from the date. */
export type LoopDailySave = { v: 1; date: string; edges: string; elapsedMs: number; solved: boolean };

/** Shape check only; whether `edges` fits today's puzzle is `restore`'s job. */
export const { load: loadLoopDaily, save: saveLoopDaily } = dailyStore<LoopDailySave>('loop:daily', (o) => {
  if (typeof o.edges !== 'string' || !/^[012]*$/.test(o.edges)) return null;
  if (typeof o.elapsedMs !== 'number' || !(o.elapsedMs >= 0)) return null;
  if (typeof o.solved !== 'boolean') return null;
  return { v: 1, date: o.date, edges: o.edges, elapsedMs: o.elapsedMs, solved: o.solved };
});

export const { get: getLoopPreset, set: setLoopPreset } = presetStore<PresetId>('loop:preset', ['small', 'medium', 'large']);
