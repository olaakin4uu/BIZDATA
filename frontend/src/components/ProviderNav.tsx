'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useProviderAuthStore } from '@/store/providerAuthStore';

const NAV = [
  { href: '/provider/dashboard', label: 'Dashboard' },
  { href: '/provider/submissions', label: 'Submissions' },
  { href: '/provider/profile', label: 'Profile' },
];

export default function ProviderNav() {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { user, clearAuth } = useProviderAuthStore();

  const handleLogout = () => {
    clearAuth();
    router.replace('/provider/login');
  };

  return (
    <header className="bg-teal-800 text-white border-b border-teal-900">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-8">
          <Link href="/provider/dashboard" className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-teal-200">
              Provider Portal
            </span>
            <span className="text-xl font-bold">BizData</span>
          </Link>
          <nav className="flex items-center gap-2">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? 'bg-teal-900 text-white'
                      : 'text-teal-100 hover:bg-teal-700'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        {user && (
          <div className="flex items-center gap-4 text-sm">
            <div className="text-right">
              <p className="font-medium leading-tight">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-teal-200 leading-tight">
                {user.providerName ?? user.provider?.name ?? '—'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs font-medium bg-teal-900 hover:bg-teal-950 rounded-md transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
