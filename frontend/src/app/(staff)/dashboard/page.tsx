'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';
import { dataRecordsApi, type DataRecordStats } from '@/lib/api/data-records';
import { providersApi, type ProviderStats } from '@/lib/api/providers';
import { scanApi, type Scan } from '@/lib/api/scan';
import { useStaffAuthStore } from '@/store/staffAuthStore';

const NAV_TILES = [
  { href: '/providers', label: 'Providers', desc: 'Banks, fintechs, telcos, processors', icon: '🏦' },
  { href: '/taxpayers', label: 'Taxpayers', desc: 'Individuals and corporates', icon: '👥' },
  { href: '/submissions', label: 'Submissions', desc: 'Uploaded data files', icon: '📤' },
  { href: '/data-records', label: 'Data Records', desc: 'All ingested rows', icon: '🗂️' },
  { href: '/flagged', label: 'Flagged Review', desc: 'Underdeclaration cases', icon: '🚩' },
  { href: '/scan', label: 'Run a Scan', desc: 'Underdeclaration analysis', icon: '🔍' },
  { href: '/audit', label: 'Audit Logs', desc: 'Tamper-evident event trail', icon: '📜' },
  { href: '/schemas', label: 'Schemas', desc: 'Per-provider column templates', icon: '🧬' },
  { href: '/settings', label: 'Settings', desc: 'Tenant configuration', icon: '⚙️' },
];

export default function StaffDashboardPage() {
  const user = useStaffAuthStore((s) => s.user);
  const [recordStats, setRecordStats] = useState<DataRecordStats | null>(null);
  const [providerStats, setProviderStats] = useState<ProviderStats | null>(null);
  const [recentScans, setRecentScans] = useState<Scan[] | null>(null);

  useEffect(() => {
    dataRecordsApi.stats().then(setRecordStats).catch(() => setRecordStats(null));
    providersApi.stats().then(setProviderStats).catch(() => setProviderStats(null));
    scanApi.list({ limit: 5 }).then((r) => setRecentScans(r.scans)).catch(() => setRecentScans([]));
  }, []);

  const activeProviders =
    providerStats?.byStatus.find((s) => s.status === 'ACTIVE')?.count ?? 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title={`Welcome back, ${user?.firstName ?? ''}`}
        subtitle="BizData cross-checks declared income against payment, banking, telco, and processor flows."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total records"
          value={recordStats?.total?.toLocaleString() ?? '—'}
          hint="Across all providers and periods"
        />
        <StatCard
          label="Pending review"
          value={recordStats?.pendingReview?.toLocaleString() ?? '—'}
          tone={recordStats && recordStats.pendingReview > 0 ? 'amber' : 'default'}
          hint="Flagged underdeclarations awaiting decision"
        />
        <StatCard
          label="Active providers"
          value={activeProviders.toLocaleString()}
          tone={activeProviders > 0 ? 'teal' : 'default'}
          hint={`${providerStats?.total ?? 0} total registered`}
        />
        <StatCard
          label="Recent scans"
          value={recentScans?.length?.toLocaleString() ?? '—'}
          tone={recentScans && recentScans.length > 0 ? 'blue' : 'default'}
          hint="Last 5 underdeclaration scans"
        />
      </div>

      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
        Navigate
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {NAV_TILES.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="group bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:border-teal-400 hover:shadow-md transition-all"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{tile.icon}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800 group-hover:text-teal-700">
                  {tile.label}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{tile.desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-800">Recent scans</h3>
            <Link href="/scan" className="text-xs text-teal-700 hover:underline font-medium">
              View all →
            </Link>
          </div>
          {recentScans === null ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : recentScans.length === 0 ? (
            <p className="text-xs text-slate-400">No scans yet — start one from the Scans page.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {recentScans.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0"
                >
                  <span className="text-slate-700 font-medium">
                    Year {s.year} · threshold {(Number(s.threshold) * 100).toFixed(0)}%
                  </span>
                  <span className="text-slate-500">
                    {s.totalFlagged}/{s.totalScanned} flagged · {s.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Provider mix</h3>
          {providerStats === null ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : providerStats.byType.length === 0 ? (
            <p className="text-xs text-slate-400">No providers yet.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {providerStats.byType.map((row) => (
                <li
                  key={row.providerType}
                  className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0"
                >
                  <span className="text-slate-700 font-medium">
                    {row.providerType.replace('_', ' ')}
                  </span>
                  <span className="text-slate-500">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
