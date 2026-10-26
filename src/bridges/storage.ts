import { dailyStore, presetStore } from '../core/storage';
import type { PresetId } from './types';

/** `links` is one char per candidate link: 0 none, 1 single, 2 double. The puzzle itself is regenerated from the date. */
export type BridgesDailySave = { v: 1; date: string; links: string; elapsedMs: number; solved: boolean };

/** Shape check only; whether `links` fits today's puzzle is `restore`'s job. */
export const { load: loadBridgesDaily, save: saveBridgesDaily } = dailyStore<BridgesDailySave>('bridges:daily', (o) => {
  if (typeof o.links !== 'string' || !/^[012]*$/.test(o.links)) return null;
  if (typeof o.elapsedMs !== 'number' || !(o.elapsedMs >= 0)) return null;
  if (typeof o.solved !== 'boolean') return null;
  return { v: 1, date: o.date, links: o.links, elapsedMs: o.elapsedMs, solved: o.solved };
});

export const { get: getBridgesPreset, set: setBridgesPreset } = presetStore<PresetId>('bridges:preset', ['small', 'medium', 'large']);
