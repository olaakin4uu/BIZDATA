'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { providersApi } from '@/lib/api/providers';
import Icon, { type IconName } from '@/components/Icon';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  section?: string;
}

// Grouped so a 25-item list reads as an organised console, not a wall of links.
const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', section: 'Overview' },
  { href: '/providers', label: 'Data Providers', icon: 'bank', section: 'Data' },
  { href: '/taxpayers', label: 'Tax Payer Data', icon: 'taxpayers' },
  { href: '/taxpayer-360', label: 'Taxpayer 360', icon: 'compass' },
  { href: '/tax-net', label: 'Tax Net', icon: 'target' },
  { href: '/declared-income', label: 'Declared Income', icon: 'document' },
  { href: '/submissions', label: 'Submissions', icon: 'upload' },
  { href: '/data-records', label: 'Data Records', icon: 'records' },
  { href: '/analytics', label: 'Analytics', icon: 'chart', section: 'Detection' },
  { href: '/scan', label: 'Scans', icon: 'search' },
  { href: '/flagged', label: 'Flagged Review', icon: 'flag' },
  { href: '/agent-signals', label: 'Agent Signals', icon: 'robot' },
  { href: '/cases', label: 'Cases', icon: 'scale', section: 'Enforcement' },
  { href: '/compliance', label: 'Compliance', icon: 'calendar' },
  { href: '/cross-state', label: 'Cross-State', icon: 'link' },
  { href: '/portfolios', label: 'Portfolios', icon: 'folder' },
  { href: '/metrics', label: 'Model & Fairness', icon: 'trend', section: 'Governance' },
  { href: '/governance', label: 'Governance', icon: 'bank' },
  { href: '/audit', label: 'Audit Logs', icon: 'scroll' },
  { href: '/access', label: 'Sensitive Access', icon: 'unlock' },
  { href: '/dpo', label: 'Data Protection', icon: 'shield' },
  { href: '/schemas', label: 'Schemas', icon: 'dna' },
  { href: '/notifications', label: 'Alerts', icon: 'bell', section: 'Admin' },
  { href: '/users', label: 'Users', icon: 'users' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

export default function StaffSidebar() {
  const pathname = usePathname() ?? '';
  const [providerCount, setProviderCount] = useState<number | null>(null);

  useEffect(() => {
    providersApi
      .stats()
      .then((s) => setProviderCount(s.total))
      .catch(() => setProviderCount(null));
  }, []);

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <aside className="w-64 min-h-screen bg-[#0c1322] text-slate-300 flex flex-col flex-shrink-0 border-r border-black/20">
      <div className="px-5 py-5 border-b border-white/5">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
          Revenue Intelligence
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-teal-500/15 text-teal-400">
            <Icon name="target" width={15} height={15} />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-white">BizData</h1>
        </div>
      </div>

      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        {NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <div key={item.href}>
              {item.section && (
                <p className="px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600 first:pt-1">
                  {item.section}
                </p>
              )}
              <Link
                href={item.href}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                  active
                    ? 'bg-white/[0.06] font-medium text-white'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100'
                }`}
              >
                {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-teal-400" aria-hidden />}
                <Icon name={item.icon} className={active ? 'text-teal-400' : 'text-slate-500 group-hover:text-slate-300'} />
                <span className="flex-1">{item.label}</span>
                {item.href === '/providers' && providerCount != null && (
                  <span className={`tnum rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-teal-500/20 text-teal-300' : 'bg-white/5 text-slate-500'}`}>
                    {providerCount}
                  </span>
                )}
              </Link>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
