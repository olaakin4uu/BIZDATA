// Sidebar personalization: pinned favorites + recently-visited routes, stored
// per-browser. A 26-item nav needs a fast path to the handful of destinations
// an officer actually lives in. Same-tab changes fire a custom event so mounted
// components can re-read without a full reload.
const FAV_KEY = 'bizdata_nav_favs';
const REC_KEY = 'bizdata_nav_recents';
const MAX_RECENTS = 5;
export const NAV_PREFS_EVENT = 'bizdata:nav-prefs';

function read(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function write(key: string, list: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(NAV_PREFS_EVENT));
  } catch {
    /* ignore */
  }
}

export function getFavorites(): string[] {
  return read(FAV_KEY);
}

export function isFavorite(href: string): boolean {
  return read(FAV_KEY).includes(href);
}

export function toggleFavorite(href: string): string[] {
  const cur = read(FAV_KEY);
  const next = cur.includes(href) ? cur.filter((h) => h !== href) : [...cur, href];
  write(FAV_KEY, next);
  return next;
}

export function getRecents(): string[] {
  return read(REC_KEY);
}

/** Record a visit — most-recent first, de-duped, capped. Dashboard is excluded
 *  (it's the home base and always one click away). */
export function pushRecent(href: string): void {
  if (!href || href === '/dashboard') return;
  const cur = read(REC_KEY).filter((h) => h !== href);
  write(REC_KEY, [href, ...cur].slice(0, MAX_RECENTS));
}
