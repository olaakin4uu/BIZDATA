'use client';
import { useEffect, useState, use as usePromise } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import { scanApi, type Scan } from '@/lib/api/scan';
import { formatDateTime, statusBadge, extractErrorMessage } from '@/lib/utils';

type Params = Promise<{ id: string }>;

export default function ScanDetailPage({ params }: { params: Params }) {
  const { id } = usePromise(params);
  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    scanApi.get(id)
      .then(setScan)
      .catch((e) => setError(extractErrorMessage(e)))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [id]);

  useEffect(() => {
    if (scan?.status !== 'RUNNING') return;
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan?.status]);

  if (loading && !scan) return <div className="p-6"><LoadingSpinner /></div>;
  if (!scan) return (
    <div className="p-6">
      <PageHeader title="Scan" actions={<Link href="/scan" className="text-sm text-slate-600 hover:text-slate-900">← Back</Link>} />
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error ?? 'Not found'}</div>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader
        title={`Scan ${scan.id.slice(0, 8)}`}
        subtitle={`Year ${scan.year} · threshold ${(Number(scan.threshold) * 100).toFixed(0)}%`}
        actions={<Link href="/scan" className="text-sm text-slate-600 hover:text-slate-900">← All scans</Link>}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Info label="Status" value={
          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge(scan.status)}`}>{scan.status}</span>
        } />
        <Info label="Started" value={formatDateTime(scan.startedAt)} />
        <Info label="Completed" value={formatDateTime(scan.completedAt)} />
        <Info label="Records scanned" value={scan.totalScanned.toLocaleString()} />
        <Info label="Records flagged" value={
          <span className={scan.totalFlagged > 0 ? 'text-red-700 font-bold' : ''}>{scan.totalFlagged.toLocaleString()}</span>
        } />
        <Info label="Est. recoverable tax" value={
          <span className="font-semibold text-slate-800">{scan.totalEstimatedTax != null ? `₦${Number(scan.totalEstimatedTax).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}</span>
        } />
        <Info label="Started by" value={scan.startedBy ? `${scan.startedBy.firstName} ${scan.startedBy.lastName}` : '—'} />
        <Info label="Provider types" value={
          scan.providerTypes && scan.providerTypes.length > 0 ? scan.providerTypes.join(', ') : 'All'
        } />
      </div>

      {scan.errorMessage && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <strong>Error:</strong> {scan.errorMessage}
        </div>
      )}

      {scan.status === 'COMPLETED' && scan.totalFlagged > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800">
          <p className="font-medium mb-2">
            {scan.totalFlagged} record{scan.totalFlagged !== 1 ? 's' : ''} flagged for review.
          </p>
          <Link
            href="/flagged"
            className="inline-block px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg"
          >
            Go to Flagged Review →
          </Link>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="text-sm text-slate-800 mt-1">{value}</div>
    </div>
  );
}
