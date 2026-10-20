/** Path colors; index = color id. Approved "Dusk" palette — do not reorder. */
export const PALETTE: readonly string[] = [
  '#ff5c7a', '#4cb0ff', '#34e3a0', '#ffd447', '#b48cff', '#ff9f45', '#3fe0e6', '#ff7ad9', '#c9f05a',
];

/** Colorblind-mode glyphs; index = color id. */
export const GLYPHS: readonly string[] = ['●', '▲', '■', '◆', '★', '✚', '⬟', '⬢', '✖'];

/** Board fill rgba(255,255,255,.06) composited over the page background. */
export const BOARD_BG_EFFECTIVE = '#1d1b28';

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map(x => x + x).join('') : h;
  const [r, g, b] = [0, 2, 4].map(i => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two hex colors (1..21). */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = luminance(hexA);
  const b = luminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
