'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import { providerPortalApi, type ProviderDashboard } from '@/lib/api/provider-portal';
import { useProviderAuthStore } from '@/store/providerAuthStore';
import { formatDate, statusBadge, extractErrorMessage } from '@/lib/utils';

export default function ProviderDashboardPage() {
  const user = useProviderAuthStore((s) => s.user);
  const [data, setData] = useState<ProviderDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    providerPortalApi.dashboard()
      .then(setData)
      .catch((e) => setError(extractErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  const lastSubmission = data?.recentSubmissions?.[0];

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.firstName ?? ''}`}
        subtitle={user?.providerName ?? user?.provider?.name ?? ''}
        actions={
          <Link href="/provider/submissions/new"
            className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold rounded-lg">
            + New submission
          </Link>
        }
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total submissions" value={data.stats.submissions.toLocaleString()} />
            <StatCard label="Accepted" value={data.stats.accepted.toLocaleString()} tone="emerald" />
            <StatCard label="Records ingested" value={data.stats.records.toLocaleString()} tone="teal" />
            <StatCard
              label="Flagged records"
              value={data.stats.flagged.toLocaleString()}
              tone={data.stats.flagged > 0 ? 'red' : 'default'}
              hint="Underdeclaration matches by regulator"
            />
          </div>

          {lastSubmission && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">Last submission</p>
              <div className="flex items-center justify-between mt-2 flex-wrap gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-800">{lastSubmission.periodLabel}</p>
                  <p className="text-xs text-slate-500">{lastSubmission.fileName ?? '—'} · {formatDate(lastSubmission.createdAt)}</p>
                </div>
                <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${statusBadge(lastSubmission.status)}`}>
                  {lastSubmission.status.replace('_', ' ')}
                </span>
              </div>
            </div>
          )}

          <h2 className="text-sm font-semibold text-slate-800 mb-3">Recent submissions</h2>
          {data.recentSubmissions.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-12 text-center">
              <p className="text-sm text-slate-500 mb-3">No submissions yet.</p>
              <Link href="/provider/submissions/new" className="text-sm text-teal-700 hover:underline font-medium">
                Upload your first file →
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Period', 'File', 'Status', 'Records', 'Date'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentSubmissions.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link href={`/provider/submissions/${s.id}`} className="text-teal-700 hover:underline">{s.periodLabel}</Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{s.fileName ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge(s.status)}`}>
                          {s.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">{s.acceptedCount}/{s.recordCount}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDate(s.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
