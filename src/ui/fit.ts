/** Padding of every game's `.<id>-panel` around its board; must match the game CSS. */
export const PANEL_PAD = 12;
/** Vertical space for header, subtitle, HUD and panel padding (the .puzzle-* layout in shell.css). */
export const PAGE_CHROME = 200;

export function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Whole-pixel cell size that fits `cols × rows` cells, `gap` px apart, into `availW × availH` px,
 * clamped to [min, max]. Fitting the viewport wins over legibility down to `min`.
 */
export function fitCell(
  cols: number,
  rows: number,
  availW: number,
  availH: number,
  { min, max, gap = 0 }: { min: number; max: number; gap?: number },
): number {
  const byWidth = (availW - (cols - 1) * gap) / cols;
  const byHeight = (availH - (rows - 1) * gap) / rows;
  return Math.min(max, Math.max(min, Math.floor(Math.min(byWidth, byHeight))));
}

/** Re-run `fit` whenever the window or `el` resizes. Returns a function that stops watching. */
export function watchSize(el: HTMLElement, fit: () => void): () => void {
  window.addEventListener('resize', fit);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  ro?.observe(el);
  return () => {
    window.removeEventListener('resize', fit);
    ro?.disconnect();
  };
}
