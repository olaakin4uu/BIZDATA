// Runtime re-skin: derive a full teal-* ramp from one brand hex and override
// Tailwind v4's `--color-teal-*` theme variables on <html>. Because v4 utilities
// (bg-teal-600, text-teal-700, …) resolve to var(--color-teal-*), every teal
// accent across the app re-skins instantly — no component changes.

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB | null {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix([r, g, b]: RGB, [r2, g2, b2]: RGB, t: number): RGB {
  return [Math.round(r + (r2 - r) * t), Math.round(g + (g2 - g) * t), Math.round(b + (b2 - b) * t)];
}

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

// WCAG relative luminance + contrast ratio, used to guarantee that the
// text-bearing shades stay legible on white no matter which brand hex a tenant
// supplies (a bright brand colour would otherwise push text-teal-700 below AA).
function luminance([r, g, b]: RGB): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastOnWhite(rgb: RGB): number {
  const l = luminance(rgb);
  return (1.0 + 0.05) / (l + 0.05);
}
/** Darken toward black until the colour clears `min` contrast on white (AA 4.5). */
function ensureContrast(rgb: RGB, min = 4.5): RGB {
  let out = rgb;
  for (let i = 0; i < 20 && contrastOnWhite(out) < min; i++) {
    out = mix(out, BLACK, 0.06);
  }
  return out;
}

// shade → [mix-target, amount]; 600 is the anchor (the configured colour).
const RAMP: Record<number, [RGB, number]> = {
  50: [WHITE, 0.93], 100: [WHITE, 0.85], 200: [WHITE, 0.7], 300: [WHITE, 0.55],
  400: [WHITE, 0.32], 500: [WHITE, 0.14], 600: [WHITE, 0], 700: [BLACK, 0.14],
  800: [BLACK, 0.3], 900: [BLACK, 0.45], 950: [BLACK, 0.6],
};

/** Apply a brand colour (hex) by overriding the Tailwind teal palette at runtime. */
export function applyBrandColor(hex?: string | null) {
  if (typeof document === 'undefined' || !hex) return;
  const base = hexToRgb(hex);
  if (!base) return;
  const root = document.documentElement;
  for (const [shade, [target, t]] of Object.entries(RAMP)) {
    let rgb = mix(base, target, t);
    // Shades used for text/icons on white (600–950) are clamped to AA contrast
    // so a light tenant brand can never make body text illegible.
    if (Number(shade) >= 600) rgb = ensureContrast(rgb);
    const [r, g, b] = rgb;
    root.style.setProperty(`--color-teal-${shade}`, `rgb(${r} ${g} ${b})`);
  }
}
