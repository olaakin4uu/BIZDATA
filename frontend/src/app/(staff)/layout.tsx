'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import StaffSidebar, { NAV, isNavActive } from '@/components/StaffSidebar';
import UserMenu from '@/components/UserMenu';
import Icon from '@/components/Icon';
import Breadcrumbs from '@/components/shell/Breadcrumbs';
import NotificationsBell from '@/components/shell/NotificationsBell';
import ThemeToggle from '@/components/shell/ThemeToggle';
import CommandPalette, { COMMAND_OPEN_EVENT } from '@/components/shell/CommandPalette';
import RouteProgress from '@/components/shell/RouteProgress';
import AppFooter from '@/components/shell/AppFooter';
import { pushRecent } from '@/lib/navFavorites';
import { useStaffAuthStore } from '@/store/staffAuthStore';
import { authApi } from '@/lib/api/auth';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const { token, user, hasHydrated, clearAuth, setUser } = useStaffAuthStore();
  const isChangePwRoute = pathname === '/change-password';
  // Public auth routes: render without app chrome and don't require a session.
  const isPublicAuthRoute =
    pathname === '/login' || pathname === '/forgot-password' || pathname === '/reset-password';
  // Routes that render bare (no sidebar / top bar).
  const isBareRoute = isPublicAuthRoute || isChangePwRoute;

  useEffect(() => {
    // Only decide to redirect AFTER the persisted auth has hydrated from
    // localStorage — otherwise a direct URL load flickers to /login.
    if (hasHydrated && !isBareRoute && (!token || !user)) {
      router.replace('/login');
      return;
    }
    // A user whose password was reset must set a new one before reaching any
    // app page. Send them to the forced-change screen — but never yank them off
    // a public auth route (they may be mid reset-link flow).
    if (hasHydrated && token && user?.mustChangePassword && !isChangePwRoute && !isPublicAuthRoute) {
      router.replace('/change-password');
    }
  }, [hasHydrated, isBareRoute, isChangePwRoute, isPublicAuthRoute, token, user, router]);

  // Close the mobile drawer on navigation; record the visited section for "Recent".
  useEffect(() => {
    setNavOpen(false);
    const match = NAV.find((n) => isNavActive(n.href, pathname));
    if (match) pushRecent(match.href);
  }, [pathname]);

  // Close the drawer on Escape and return focus to the trigger.
  const closeNav = () => {
    setNavOpen(false);
    hamburgerRef.current?.focus();
  };
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeNav();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  const openCommand = () => window.dispatchEvent(new Event(COMMAND_OPEN_EVENT));

  const handleSignOut = () => {
    clearAuth();
    router.replace('/login');
  };

  const handleUploadAvatar = async (file: File) => {
    const updated = await authApi.uploadStaffAvatar(file);
    setUser(updated);
  };

  if (isBareRoute) {
    return <>{children}</>;
  }

  // Wait for hydration before rendering or redirecting — avoids the flicker.
  if (!hasHydrated || !token || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--canvas)]">
        <div className="flex items-center gap-3 text-sm text-[var(--ink-3)]">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" aria-hidden />
          {!hasHydrated ? 'Loading…' : 'Redirecting to sign in…'}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--canvas)] text-[var(--ink)]">
      <RouteProgress />
      <CommandPalette />

      {/* Skip link — first focusable element, bypasses the 26-item nav. */}
      <a
        href="#main-content"
        className="sr-only left-4 top-4 z-[60] rounded-md bg-[var(--sidebar-bg)] px-4 py-2 text-sm font-medium text-white focus:not-sr-only focus:absolute"
      >
        Skip to content
      </a>

      <StaffSidebar open={navOpen} onClose={closeNav} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Global top bar: nav toggle · breadcrumb · search · alerts · theme · profile. */}
        <header className="flex h-14 flex-shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--surface)] px-3 sm:px-6">
          <button
            ref={hamburgerRef}
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            aria-controls="staff-nav"
            aria-expanded={navOpen}
            className="rounded-md p-1.5 text-[var(--ink-2)] hover:bg-[var(--surface-2)] lg:hidden"
          >
            <Icon name="menu" />
          </button>

          <div className="min-w-0 flex-1">
            <Breadcrumbs />
          </div>

          {/* Command palette entry */}
          <button
            type="button"
            onClick={openCommand}
            className="hidden items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-sm text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] md:flex"
          >
            <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" />
            </svg>
            <span>Search…</span>
            <kbd className="rounded border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
          </button>
          <button
            type="button"
            onClick={openCommand}
            aria-label="Search"
            className="grid h-9 w-9 place-items-center rounded-lg text-[var(--ink-2)] hover:bg-[var(--surface-2)] md:hidden"
          >
            <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" />
            </svg>
          </button>

          <NotificationsBell />
          <ThemeToggle />
          <div className="mx-0.5 hidden h-6 w-px bg-[var(--line)] sm:block" aria-hidden />
          <UserMenu user={user} onSignOut={handleSignOut} onUploadAvatar={handleUploadAvatar} accountHref="/account" />
        </header>

        <main id="main-content" className="flex-1 overflow-auto">{children}</main>

        <AppFooter />
      </div>
    </div>
  );
}
