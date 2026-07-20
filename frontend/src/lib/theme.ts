// Light/dark theme, persisted per-user. globals.css exposes the tokens under
// `:root[data-theme="dark"]` / `[data-theme="light"]` plus a prefers-color-scheme
// default, so setting the `data-theme` attribute is all we need. A blocking
// inline script in the root layout applies the stored choice before first paint
// (no flash); this module drives the runtime toggle.
export type ThemeChoice = 'light' | 'dark';

const KEY = 'bizdata_theme';

/** The user's explicit choice, or null when they follow the OS setting. */
export function storedTheme(): ThemeChoice | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

/** The theme actually in effect right now (explicit choice, else OS preference). */
export function effectiveTheme(): ThemeChoice {
  const s = storedTheme();
  if (s) return s;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function applyTheme(t: ThemeChoice): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = t;
}

export function setTheme(t: ThemeChoice): void {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
  applyTheme(t);
}
