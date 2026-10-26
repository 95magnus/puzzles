import { generateWithSolution } from './generate';
import { mulberry32 } from '../../core/rng';

self.onmessage = (e: MessageEvent<{ id: number; size: number; seed: number }>) => {
  const { id, size, seed } = e.data;
  const { puzzle } = generateWithSolution(size, mulberry32(seed));
  (self as unknown as Worker).postMessage({ id, puzzle });
};
