'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon, { type IconName } from '@/components/Icon';
import { APP_NAME, APP_TAGLINE } from '@/lib/appName';
import { APP_VERSION } from '@/lib/appMeta';
import { useNavCounts, type NavCounts } from '@/hooks/useNavCounts';
import { getFavorites, getRecents, toggleFavorite, NAV_PREFS_EVENT } from '@/lib/navFavorites';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  section?: string;
}

// Grouped so a 26-item list reads as an organised console, not a wall of links.
// Icons are unique per destination (no duplicate glyphs) for faster scanning.
export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', section: 'Overview' },
  { href: '/iris', label: 'Ask IRIS', icon: 'robot' },
  { href: '/providers', label: 'Data Providers', icon: 'providers', section: 'Data' },
  { href: '/taxpayers', label: 'Tax Payer Data', icon: 'taxpayers' },
  { href: '/taxpayer-360', label: 'Taxpayer 360', icon: 'compass' },
  { href: '/tax-net', label: 'Tax Net', icon: 'target' },
  { href: '/declared-income', label: 'Declared Income', icon: 'document' },
  { href: '/submissions', label: 'Submissions', icon: 'upload' },
  { href: '/data-records', label: 'Data Records', icon: 'records' },
  { href: '/analytics', label: 'Analytics', icon: 'chart', section: 'Detection' },
  { href: '/scan', label: 'Scans', icon: 'search' },
  { href: '/flagged', label: 'Flagged Review', icon: 'flag' },
  { href: '/agent-signals', label: 'Agent Signals', icon: 'signal' },
  { href: '/cases', label: 'Cases', icon: 'scale', section: 'Enforcement' },
  { href: '/compliance', label: 'Compliance', icon: 'calendar' },
  { href: '/cross-state', label: 'Cross-State', icon: 'link' },
  { href: '/portfolios', label: 'Portfolios', icon: 'folder' },
  { href: '/metrics', label: 'Model & Fairness', icon: 'trend', section: 'Governance' },
  { href: '/governance', label: 'Governance', icon: 'gavel' },
  { href: '/audit', label: 'Audit Logs', icon: 'scroll' },
  { href: '/access', label: 'Sensitive Access', icon: 'unlock' },
  { href: '/dpo', label: 'Data Protection', icon: 'shield' },
  { href: '/schemas', label: 'Schemas', icon: 'dna' },
  { href: '/notifications', label: 'Alerts', icon: 'bell', section: 'Admin' },
  { href: '/users', label: 'Users', icon: 'users' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

const BY_HREF: Record<string, NavItem> = Object.fromEntries(NAV.map((n) => [n.href, n]));

export function isNavActive(href: string, pathname: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(href + '/');
}

/** Section + label of the active nav item — used by the top bar for orientation. */
export function activeNav(pathname: string): { section?: string; label: string } | null {
  const match = NAV.find((n) => isNavActive(n.href, pathname));
  if (!match) return null;
  let section = match.section;
  if (!section) {
    const idx = NAV.indexOf(match);
    for (let i = idx; i >= 0; i--) {
      if (NAV[i].section) {
        section = NAV[i].section;
        break;
      }
    }
  }
  return { section, label: match.label };
}

function badgeFor(href: string, counts: NavCounts): number | undefined {
  if (href === '/providers') return counts.providers;
  if (href === '/notifications') return counts.unreadAlerts;
  return undefined;
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
const COLLAPSE_KEY = 'bizdata_nav_collapsed';

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.9 6.8 20.6l1-5.8-4.3-4.1 5.9-.9z" />
    </svg>
  );
}

function NavRow({
  item,
  active,
  collapsed,
  badge,
  favorite,
  onToggleFav,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  badge?: number;
  favorite: boolean;
  onToggleFav?: (href: string) => void;
  onNavigate?: () => void;
}) {
  const hasBadge = badge != null && badge > 0;
  return (
    <div className={`group relative flex items-center rounded-lg ${active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}>
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
        className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors ${
          collapsed ? 'lg:justify-center lg:px-0' : ''
        } ${active ? 'font-medium text-white' : 'text-slate-300 group-hover:text-white'}`}
      >
        {active && <span className={`absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-teal-400 ${collapsed ? 'lg:hidden' : ''}`} aria-hidden />}
        <span className="relative flex-shrink-0">
          <Icon name={item.icon} className={active ? 'text-teal-400' : 'text-slate-400 group-hover:text-slate-200'} />
          {/* Collapsed rail: a dot stands in for the hidden count badge. */}
          {hasBadge && <span className={`absolute -right-1 -top-1 hidden h-1.5 w-1.5 rounded-full bg-teal-400 ${collapsed ? 'lg:block' : ''}`} aria-hidden />}
        </span>
        <span className={`min-w-0 flex-1 truncate ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
        {hasBadge && (
          <span
            className={`tnum mr-1 rounded-full px-1.5 py-0.5 text-[10px] ${collapsed ? 'lg:hidden' : ''} ${
              active ? 'bg-teal-500/20 text-teal-300' : 'bg-white/5 text-slate-300'
            }`}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </Link>
      {onToggleFav && (
        <button
          type="button"
          onClick={() => onToggleFav(item.href)}
          aria-label={favorite ? `Unpin ${item.label}` : `Pin ${item.label}`}
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 transition-opacity ${collapsed ? 'lg:hidden' : ''} ${
            favorite ? 'text-teal-400' : 'text-slate-500 opacity-0 hover:text-teal-300 focus-visible:opacity-100 group-hover:opacity-100'
          }`}
        >
          <StarIcon filled={favorite} />
        </button>
      )}
    </div>
  );
}

export default function StaffSidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname() ?? '';
  const counts = useNavCounts();
  const panelRef = useRef<HTMLElement>(null);

  const [collapsed, setCollapsed] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);

  // Load persisted prefs post-mount (avoids SSR/hydration mismatch).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* ignore */
    }
    const sync = () => {
      setFavorites(getFavorites());
      setRecents(getRecents());
    };
    sync();
    window.addEventListener(NAV_PREFS_EVENT, sync);
    return () => window.removeEventListener(NAV_PREFS_EVENT, sync);
  }, []);

  // Recents change as the officer navigates.
  useEffect(() => {
    setRecents(getRecents());
  }, [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const onToggleFav = useCallback((href: string) => setFavorites(toggleFavorite(href)), []);

  // Focus trap for the mobile overlay drawer (not the static desktop rail).
  useEffect(() => {
    if (!open) return;
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 1023px)').matches) return;
    const node = panelRef.current;
    const focusables = () =>
      node ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null) : [];
    (focusables()[0] ?? node)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  const favItems = favorites.map((h) => BY_HREF[h]).filter(Boolean);
  const recentItems = recents.map((h) => BY_HREF[h]).filter((n) => n && !isNavActive(n.href, pathname));

  const renderRow = (item: NavItem, opts?: { pinnable?: boolean }) => (
    <NavRow
      key={item.href}
      item={item}
      active={isNavActive(item.href, pathname)}
      collapsed={collapsed}
      badge={badgeFor(item.href, counts)}
      favorite={favorites.includes(item.href)}
      onToggleFav={opts?.pinnable ? onToggleFav : undefined}
      onNavigate={onClose}
    />
  );

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} aria-hidden />}

      <aside
        ref={panelRef}
        id="staff-nav"
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        aria-label="Primary navigation"
        tabIndex={-1}
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh flex-shrink-0 transform flex-col border-r border-black/20 bg-[var(--sidebar-bg)] text-slate-300 outline-none transition-[transform,width] duration-200 lg:static lg:z-auto lg:h-auto lg:min-h-screen lg:translate-x-0 lg:visible ${
          collapsed ? 'w-64 lg:w-16' : 'w-64'
        } ${open ? 'translate-x-0' : '-translate-x-full max-lg:invisible'}`}
      >
        {/* Brand / wordmark */}
        <div className="flex items-center justify-between border-b border-white/5 px-3 py-5 lg:px-4">
          <Link href="/dashboard" onClick={onClose} className="flex min-w-0 items-center gap-2" aria-label={`${APP_NAME} — Dashboard`}>
            <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-teal-500/15 text-teal-400">
              <Icon name="target" width={16} height={16} />
            </span>
            <span className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
              <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">{APP_TAGLINE}</span>
              <span className="block truncate text-lg font-semibold leading-tight tracking-tight text-white">{APP_NAME}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="-mr-1 rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <nav aria-label="Primary" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {/* Pinned */}
          {favItems.length > 0 && (
            <div className={collapsed ? 'lg:hidden' : ''}>
              <p className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Pinned</p>
              {favItems.map((item) => renderRow(item, { pinnable: true }))}
              <div className="my-2 h-px bg-white/5" />
            </div>
          )}

          {/* Recent */}
          {recentItems.length > 0 && (
            <div className={collapsed ? 'lg:hidden' : ''}>
              <p className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Recent</p>
              {recentItems.slice(0, 3).map((item) => renderRow(item))}
              <div className="my-2 h-px bg-white/5" />
            </div>
          )}

          {/* Full nav */}
          {NAV.map((item) => (
            <div key={item.href}>
              {item.section && (
                <p className={`px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 first:pt-1 ${collapsed ? 'lg:hidden' : ''}`}>
                  {item.section}
                </p>
              )}
              {renderRow(item, { pinnable: true })}
            </div>
          ))}
        </nav>

        {/* Utility footer: version + desktop collapse toggle */}
        <div className="border-t border-white/5 px-3 py-3">
          <div className={`flex items-center ${collapsed ? 'lg:justify-center' : 'justify-between'}`}>
            <span className={`tnum text-[10px] text-slate-500 ${collapsed ? 'lg:hidden' : ''}`}>v{APP_VERSION}</span>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand' : 'Collapse'}
              className="hidden h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white lg:grid"
            >
              <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={collapsed ? 'rotate-180' : ''}>
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
