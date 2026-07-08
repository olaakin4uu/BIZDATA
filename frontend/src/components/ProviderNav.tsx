'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useProviderAuthStore } from '@/store/providerAuthStore';
import UserMenu from '@/components/UserMenu';
import { providerAuthApi } from '@/lib/api/auth';

const NAV = [
  { href: '/provider/dashboard', label: 'Dashboard' },
  { href: '/provider/submissions', label: 'Submissions' },
  { href: '/provider/profile', label: 'Profile' },
];

export default function ProviderNav() {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { user, clearAuth, setUser } = useProviderAuthStore();

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
            {/* logo mark — a filed-return glyph in a glass tile */}
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 shadow-sm transition-transform group-hover:scale-105">
              <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M7 3.5h6l5 5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
                <path d="M13 3.5V9h5" />
                <path d="m8.5 14 2 2 4-4.5" />
              </svg>
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[10px] uppercase tracking-[0.18em] text-teal-100/90">
                Provider Portal
              </span>
              <span className="text-lg font-bold tracking-tight mt-0.5">BizData</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'text-white bg-white/12'
                      : 'text-teal-100/85 hover:text-white hover:bg-white/8'
                  }`}
                >
                  {item.label}
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
