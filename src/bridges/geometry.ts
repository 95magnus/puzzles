import type { Dir, Island, Layout, Link } from './types';

/** Every possible link: from each island the nearest island to the right and below, if at least one cell lies between. */
export function buildLinks(size: number, islands: Island[]): { links: Link[]; islandLinks: number[][] } {
  const at = new Map(islands.map((isl, i) => [isl.cell, i]));
  const links: Link[] = [];
  islands.forEach((isl, a) => {
    const r = Math.floor(isl.cell / size);
    const c = isl.cell % size;
    for (const horizontal of [true, false]) {
      const inner: number[] = [];
      for (let k = 1; (horizontal ? c : r) + k < size; k++) {
        const cell = horizontal ? isl.cell + k : isl.cell + k * size;
        const b = at.get(cell);
        if (b === undefined) {
          inner.push(cell);
          continue;
        }
        if (inner.length > 0) links.push({ a, b, horizontal, inner, crosses: [] });
        break;
      }
    }
  });
  links.sort((x, y) => x.a - y.a || x.b - y.b);
  links.forEach((h, i) => {
    if (!h.horizontal) return;
    links.forEach((v, j) => {
      if (v.horizontal || !h.inner.some((cell) => v.inner.includes(cell))) return;
      h.crosses.push(j);
      v.crosses.push(i);
    });
  });
  links.forEach((l) => l.crosses.sort((x, y) => x - y));
  const islandLinks: number[][] = islands.map(() => []);
  links.forEach((l, i) => {
    islandLinks[l.a].push(i);
    islandLinks[l.b].push(i);
  });
  return { links, islandLinks };
}

/** A layout from islands in any order (sorted by cell here). */
export function layout(size: number, islands: Island[]): Layout {
  const sorted = islands.slice().sort((x, y) => x.cell - y.cell);
  return { size, islands: sorted, ...buildLinks(size, sorted) };
}

/** The link leaving `island` in direction `dir`, or -1. */
export function linkFrom(p: Layout, island: number, dir: Dir): number {
  const horizontal = dir === 'left' || dir === 'right';
  const forward = dir === 'right' || dir === 'down';
  return (
    p.islandLinks[island].find((i) => {
      const l = p.links[i];
      return l.horizontal === horizontal && (forward ? l.a === island : l.b === island);
    }) ?? -1
  );
}

/** Bridge total at each island. */
export function totals(p: Layout, bridges: readonly number[]): number[] {
  const out = p.islands.map(() => 0);
  p.links.forEach((l, i) => {
    out[l.a] += bridges[i];
    out[l.b] += bridges[i];
  });
  return out;
}

/** Per island, the lowest island index in its connected component (links with bridges). */
export function components(p: Layout, bridges: readonly number[]): number[] {
  const root = p.islands.map((_, i) => i);
  const find = (x: number): number => (root[x] === x ? x : (root[x] = find(root[x])));
  p.links.forEach((l, i) => {
    if (bridges[i] === 0) return;
    const x = find(l.a);
    const y = find(l.b);
    root[Math.max(x, y)] = Math.min(x, y);
  });
  return p.islands.map((_, i) => find(i));
}
