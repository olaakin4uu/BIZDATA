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
    const [r, g, b] = mix(base, target, t);
    root.style.setProperty(`--color-teal-${shade}`, `rgb(${r} ${g} ${b})`);
  }
}
