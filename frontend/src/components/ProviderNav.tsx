'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useProviderAuthStore } from '@/store/providerAuthStore';
import UserMenu from '@/components/UserMenu';
import { providerAuthApi } from '@/lib/api/auth';
import { providerPortalApi } from '@/lib/api/provider-portal';
import { APP_NAME } from '@/lib/appName';
import { useBranding } from '@/lib/branding';

const NAV = [
  { href: '/provider/dashboard', label: 'Dashboard' },
  { href: '/provider/submissions', label: 'Submissions' },
  { href: '/provider/notifications', label: 'Notifications' },
  { href: '/provider/profile', label: 'Profile' },
];

export default function ProviderNav() {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { user, clearAuth, setUser } = useProviderAuthStore();
  const branding = useBranding();
  // Unread badge. Re-read on every route change so it clears as soon as the
  // provider marks something read, without a full reload.
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!user || user.mustChangePassword) { setUnread(0); return; }
    let alive = true;
    providerPortalApi.notifications()
      .then((n) => { if (alive) setUnread(n.filter((x) => !x.read).length); })
      .catch(() => { /* a badge is not worth surfacing an error for */ });
    return () => { alive = false; };
  }, [user, pathname]);

  const handleLogout = () => {
    clearAuth();
    router.replace('/provider/login');
  };

  const handleUploadAvatar = async (file: File) => {
    const updated = await providerAuthApi.uploadProviderAvatar(file);
    setUser(updated);
  };

  // Show the provider organisation name under the user's name in the menu.
  const menuUser = user
    ? { ...user, role: user.providerName ?? user.provider?.name ?? user.role }
    : null;

  return (
    <header
      className="sticky top-0 z-40 text-white border-b border-teal-900/40 backdrop-blur"
      style={{ backgroundImage: 'var(--brand-grad)', boxShadow: 'var(--elev-2)' }}
    >
      {/* faint top sheen for depth */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20" aria-hidden />
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-8">
          <Link href="/provider/dashboard" className="flex items-center gap-3 group">
            {/* The organisation's logo, uploaded under Settings. Until one is
                uploaded, fall back to a generic filed-return glyph in a glass
                tile — the logo sits on white because most are dark artwork and
                the header ground is the brand gradient. */}
            {branding?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt={branding.name || 'Organisation logo'}
                className="h-9 w-auto max-w-[132px] rounded-xl bg-white object-contain px-2 py-1 shadow-sm ring-1 ring-white/25 transition-transform group-hover:scale-105"
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 shadow-sm transition-transform group-hover:scale-105">
                <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M7 3.5h6l5 5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
                  <path d="M13 3.5V9h5" />
                  <path d="m8.5 14 2 2 4-4.5" />
                </svg>
              </span>
            )}
            <span className="flex flex-col leading-none">
              <span className="text-[10px] uppercase tracking-[0.18em] text-teal-100/90">
                Provider Portal
              </span>
              <span className="text-lg font-bold tracking-tight mt-0.5">{APP_NAME}</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              // While a password change is mandatory the layout redirects every
              // route back to Profile. Rendering these as normal links makes them
              // look broken, so show them locked and explain why on hover.
              const locked = !!user?.mustChangePassword && item.href !== '/provider/profile';
              if (locked) {
                return (
                  <span
                    key={item.href}
                    aria-disabled="true"
                    title="Set a new password on the Profile page to unlock"
                    className="relative px-3 py-2 rounded-lg text-sm font-medium text-teal-100/40 cursor-not-allowed select-none"
                  >
                    {item.label}
                    <span aria-hidden className="ml-1.5 text-[11px]">&#128274;</span>
                  </span>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'text-white bg-white/12'
                      : 'text-teal-100/85 hover:text-white hover:bg-white/8'
                  }`}
                >
                  {item.label}
                  {item.href === '/provider/notifications' && unread > 0 && (
                    <span
                      className="ml-1.5 inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-amber-400 px-1 py-px text-[11px] font-bold leading-none text-amber-950 align-middle"
                      aria-label={`${unread} unread`}
                    >
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                  {active && (
                    <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-white/80 shadow-[0_0_8px_rgba(255,255,255,0.5)]" aria-hidden />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
        {menuUser && (
          <UserMenu
            user={menuUser}
            onSignOut={handleLogout}
            onUploadAvatar={handleUploadAvatar}
            variant="dark"
          />
        )}
      </div>
    </header>
  );
}
