'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStaffAuthStore } from '@/store/staffAuthStore';
import { providersApi } from '@/lib/api/providers';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { href: '/providers', label: 'Providers', icon: '🏦' },
  { href: '/taxpayers', label: 'Taxpayers', icon: '👥' },
  { href: '/taxpayer-360', label: 'Taxpayer 360', icon: '🧭' },
  { href: '/declared-income', label: 'Declared Income', icon: '📑' },
  { href: '/submissions', label: 'Submissions', icon: '📤' },
  { href: '/compliance', label: 'Compliance', icon: '📅' },
  { href: '/cross-state', label: 'Cross-State', icon: '🔗' },
  { href: '/data-records', label: 'Data Records', icon: '🗂️' },
  { href: '/cases', label: 'Cases', icon: '⚖️' },
  { href: '/flagged', label: 'Flagged Review', icon: '🚩' },
  { href: '/scan', label: 'Scans', icon: '🔍' },
  { href: '/schemas', label: 'Schemas', icon: '🧬' },
  { href: '/audit', label: 'Audit Logs', icon: '📜' },
  { href: '/notifications', label: 'Alerts', icon: '🔔' },
  { href: '/metrics', label: 'Model & Fairness', icon: '📈' },
  { href: '/governance', label: 'Governance', icon: '🏛️' },
  { href: '/access', label: 'Sensitive Access', icon: '🔓' },
  { href: '/dpo', label: 'Data Protection', icon: '🛡️' },
  { href: '/users', label: 'Users', icon: '🛡️' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function StaffSidebar() {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { user, clearAuth } = useStaffAuthStore();
  const [providerCount, setProviderCount] = useState<number | null>(null);

  useEffect(() => {
    providersApi
      .stats()
      .then((s) => setProviderCount(s.total))
      .catch(() => setProviderCount(null));
  }, []);

  const handleLogout = () => {
    clearAuth();
    router.replace('/login');
  };

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <aside className="w-64 min-h-screen bg-slate-900 text-white flex flex-col flex-shrink-0">
      <div className="px-6 py-5 border-b border-slate-800">
        <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400">
          Multi-Source Data Intelligence
        </p>
        <h1 className="text-2xl font-bold text-teal-400 mt-1">BizData</h1>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-teal-600 text-white font-medium'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.href === '/providers' && providerCount != null && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    active ? 'bg-teal-700 text-white' : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {providerCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-slate-800">
        <p className="text-xs font-medium text-slate-200 truncate">
          {user?.firstName} {user?.lastName}
        </p>
        <p className="text-xs text-slate-500 truncate">
          {user?.role?.replace('_', ' ')}
        </p>
        <button
          onClick={handleLogout}
          className="mt-3 text-xs text-slate-400 hover:text-red-400 transition-colors"
        >
          Sign out →
        </button>
      </div>
    </aside>
  );
}
