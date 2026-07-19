'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import DataTable, { type Column } from '@/components/DataTable';
import { scanApi, type Scan } from '@/lib/api/scan';
import { PROVIDER_TYPES, formatDateTime, statusBadge, extractErrorMessage } from '@/lib/utils';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

export default function ScanPage() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [threshold, setThreshold] = useState('20');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState<Scan | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  // History-table filters (the API already supports year + status).
  const [filterYear, setFilterYear] = useState<number | ''>('');
  const [filterStatus, setFilterStatus] = useState('');
  const limit = 50;

  useEffect(() => { setPage(1); }, [filterYear, filterStatus]);

  const load = () => {
    setLoading(true);
    scanApi.list({ year: filterYear || undefined, status: filterStatus || undefined, page, limit })
      .then((r) => { setScans(r.scans); setTotal(r.total); })
      .catch((e) => { if ((e as any)?.status !== 401) { setScans([]); setTotal(0); } })
      .finally(() => setLoading(false));
  };

  useEffect(load, [page, filterYear, filterStatus]);

  // Poll running scan
  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      try {
        const s = await scanApi.get(running.id);
        if (s.status !== 'RUNNING') {
          setRunning(null);
          load();
        } else {
          setRunning(s);
        }
      } catch {
        // ignore
      }
    }, 2500);
    return () => clearInterval(t);
  }, [running]);

  const toggleType = (t: string) => {
    setSelectedTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  };

  const handleRun = async () => {
    const thresholdNum = parseFloat(threshold) / 100;
    if (!isFinite(thresholdNum) || thresholdNum <= 0 || thresholdNum > 1) {
      setRunError('Threshold must be between 1 and 100');
      return;
    }
    if (!confirm(`Run an underdeclaration scan for ${year} at ${threshold}% threshold?`)) return;
    setRunError(null);
    try {
      const s = await scanApi.create({
        year,
        threshold: thresholdNum,
        providerTypes: selectedTypes.length > 0 ? selectedTypes : undefined,
      });
      setRunning(s);
      load();
    } catch (err) {
      setRunError(extractErrorMessage(err));
    }
  };

  const columns: Column<Scan>[] = [
    { key: 'year', header: 'Year', cell: (r) => <span className="font-mono text-xs">{r.year}</span> },
    { key: 'threshold', header: 'Threshold', cell: (r) => <span className="text-xs">{(Number(r.threshold) * 100).toFixed(0)}%</span> },
    { key: 'types', header: 'Types', cell: (r) => <span className="text-xs text-slate-600">{r.providerTypes && r.providerTypes.length > 0 ? r.providerTypes.join(', ') : 'All'}</span> },
    { key: 'scanned', header: 'Scanned', cell: (r) => <span className="text-xs">{r.totalScanned.toLocaleString()}</span> },
    { key: 'flagged', header: 'Flagged', cell: (r) => <span className={`text-xs font-semibold ${r.totalFlagged > 0 ? 'text-red-700' : 'text-slate-500'}`}>{r.totalFlagged.toLocaleString()}</span> },
    { key: 'esttax', header: 'Est. tax', cell: (r) => <span className="text-xs font-medium text-slate-700">{r.totalEstimatedTax != null ? `₦${Number(r.totalEstimatedTax).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}</span> },
    {
      key: 'status', header: 'Status',
      cell: (r) => (
        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge(r.status)}`}>
          {r.status}
        </span>
      ),
    },
    { key: 'by', header: 'Started by', cell: (r) => <span className="text-xs">{r.startedBy ? `${r.startedBy.firstName} ${r.startedBy.lastName}` : '—'}</span> },
    { key: 'when', header: 'Started', cell: (r) => <span className="text-xs text-slate-500">{formatDateTime(r.startedAt)}</span> },
    {
      key: 'view', header: '',
      cell: (r) => <Link href={`/scan/${r.id}`} className="text-xs text-teal-700 hover:underline font-medium">View →</Link>,
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Underdeclaration scans"
        subtitle="Aggregate provider inflows per taxpayer, compare to declared income, flag the gap."
      />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="font-semibold text-slate-800 mb-3">New scan</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Year</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Threshold (%)</label>
            <input type="number" min={1} max={100} value={threshold} onChange={(e) => setThreshold(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
        </div>

        <div className="mb-4">
          <p className="text-xs font-medium text-slate-700 mb-2">Limit to provider types (empty = all)</p>
          <div className="flex flex-wrap gap-2">
            {PROVIDER_TYPES.map((t) => {
              const active = selectedTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleType(t)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    active ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-teal-400'
                  }`}
                >
                  {t.replace(/_/g, ' ')}
                </button>
              );
            })}
          </div>
        </div>

        {runError && (
          <div className="px-3 py-2 mb-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{runError}</div>
        )}

        <button
          onClick={handleRun}
          disabled={!!running}
          className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
        >
          {running ? 'Scan in progress…' : 'Run scan'}
        </button>

        {running && (
          <div className="mt-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            Scan <span className="font-mono">{running.id.slice(0, 8)}</span> is running… polling every 2.5s.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h2 className="text-sm font-semibold text-slate-800">History</h2>
        <div className="flex items-center gap-2">
          <select value={filterYear} onChange={(e) => setFilterYear(e.target.value ? Number(e.target.value) : '')}
            className="border border-slate-300 rounded-lg text-xs px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="">All years</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-slate-300 rounded-lg text-xs px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="">All statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="RUNNING">Running</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={scans}
        rowKey={(r) => r.id}
        loading={loading}
        emptyText="No scans recorded yet."
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
      />
    </div>
  );
}
