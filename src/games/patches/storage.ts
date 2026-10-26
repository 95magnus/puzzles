import { dailyStore, presetStore } from '../../core/storage';
import type { PresetId } from './types';

/** `rects` is the game's encoding: `r,c,w,h` joined by `;` (empty when none). The puzzle itself is regenerated from the date. */
export type PatchesDailySave = { v: 1; date: string; rects: string; elapsedMs: number; solved: boolean };

/** Shape check only; whether `rects` fits today's puzzle is `restore`'s job. */
export const { load: loadPatchesDaily, save: savePatchesDaily } = dailyStore<PatchesDailySave>('patches:daily', (o) => {
  if (typeof o.rects !== 'string' || !/^[0-9,;]*$/.test(o.rects)) return null;
  if (typeof o.elapsedMs !== 'number' || !(o.elapsedMs >= 0)) return null;
  if (typeof o.solved !== 'boolean') return null;
  return { v: 1, date: o.date, rects: o.rects, elapsedMs: o.elapsedMs, solved: o.solved };
});

export const { get: getPatchesPreset, set: setPatchesPreset } = presetStore<PresetId>('patches:preset', ['small', 'medium', 'large']);
