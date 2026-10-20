import { generateWithSolution } from '../core/generator';
import { mulberry32 } from '../core/rng';
import type { Puzzle } from '../core/types';

export const STALE: unique symbol = Symbol('stale');

type Pending = { resolve: (p: Puzzle) => void; reject: (e: unknown) => void; size: number; seed: number };

let worker: Worker | null = null;
let useFallback = false;
let nextId = 0;
const pending = new Map<number, Pending>();

function generateLocal(size: number, seed: number): Puzzle {
  return generateWithSolution(size, mulberry32(seed)).puzzle;
}

function switchToFallback(): void {
  useFallback = true;
  worker?.terminate();
  worker = null;
  const waiting = [...pending.values()];
  pending.clear();
  for (const p of waiting) {
    try { p.resolve(generateLocal(p.size, p.seed)); } catch (e) { p.reject(e); }
  }
}

function getWorker(): Worker | null {
  if (useFallback) return null;
  if (worker) return worker;
  try {
    if (typeof Worker === 'undefined') throw new Error('no Worker');
    const w = new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ id: number; puzzle: Puzzle }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      p.resolve(e.data.puzzle);
    };
    w.onerror = () => switchToFallback();
    worker = w;
    return w;
  } catch {
    useFallback = true;
    return null;
  }
}

export function requestPuzzle(size: number, seed: number): Promise<Puzzle> {
  const w = getWorker();
  if (!w) {
    try { return Promise.resolve(generateLocal(size, seed)); } catch (e) { return Promise.reject(e); }
  }
  return new Promise<Puzzle>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, size, seed });
    try {
      w.postMessage({ id, size, seed });
    } catch {
      switchToFallback();
    }
  });
}

export function latestOnly<A extends unknown[], R>(
  fn: (...a: A) => Promise<R>,
): (...a: A) => Promise<R | typeof STALE> {
  let latest = 0;
  return async (...a: A) => {
    const token = ++latest;
    try {
      const r = await fn(...a);
      return token === latest ? r : STALE;
    } catch (e) {
      if (token !== latest) return STALE;
      throw e;
    }
  };
}
