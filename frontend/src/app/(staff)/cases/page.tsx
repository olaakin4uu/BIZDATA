'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import {
  casesApi,
  formatNaira,
  caseDisplayName,
  type UnderdeclarationCase,
  type CaseStatus,
  type RiskLevel,
} from '@/lib/api/cases';
import { extractErrorMessage } from '@/lib/utils';

const STATUS_LABEL: Record<CaseStatus, string> = {
  OPEN: 'Open',
  UNDER_REVIEW: 'Under review',
  NOTICE_ISSUED: 'Notice issued',
  OBJECTION: 'Objection',
  CONFIRMED: 'Confirmed',
  SETTLED: 'Settled',
  RECOVERED: 'Recovered',
  DISMISSED: 'Dismissed',
  CLOSED: 'Closed',
};

const RISK_TEXT: Record<RiskLevel, string> = {
  CRITICAL: 'text-red-700',
  HIGH: 'text-orange-700',
  MEDIUM: 'text-blue-700',
  LOW: 'text-slate-600',
};

const STATUSES: CaseStatus[] = ['OPEN', 'UNDER_REVIEW', 'NOTICE_ISSUED', 'OBJECTION', 'CONFIRMED', 'SETTLED', 'RECOVERED', 'DISMISSED'];
const RISKS: RiskLevel[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const PAGE_SIZE = 50;
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];
type SortKey = 'estimatedTaxDue' | 'confidence';

export default function CasesListPage() {
  const params = useSearchParams();
  const [status, setStatus] = useState<CaseStatus | ''>((params?.get('status') as CaseStatus) || '');
  const [riskLevel, setRiskLevel] = useState<RiskLevel | ''>((params?.get('riskLevel') as RiskLevel) || '');
  const [year, setYear] = useState<number | ''>('');
  const [sort, setSort] = useState<SortKey>('estimatedTaxDue');
  const [page, setPage] = useState(1);
  const [cases, setCases] = useState<UnderdeclarationCase[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Reset to the first page whenever a filter/sort changes.
  useEffect(() => { setPage(1); }, [status, riskLevel, year, sort]);

  useEffect(() => {
    setCases(null); setError(null);
    casesApi
      .list({
        status: status || undefined,
        riskLevel: riskLevel || undefined,
        year: year || undefined,
        sort,
        page,
        limit: PAGE_SIZE,
      })
      .then((r) => { setCases(r.cases); setTotal(r.total); })
      .catch((e) => { setCases([]); setTotal(0); setError(extractErrorMessage(e)); });
  }, [status, riskLevel, year, sort, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Underdeclaration cases"
        subtitle="Prioritized worklist of taxpayers whose observed flows exceed their declared income."
      />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as CaseStatus | '')}
          className="border border-slate-300 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select
          value={riskLevel}
          onChange={(e) => setRiskLevel(e.target.value as RiskLevel | '')}
          className="border border-slate-300 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="">All risk levels</option>
          {RISKS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')}
          className="border border-slate-300 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="">All years</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="border border-slate-300 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
          title="Sort order"
        >
          <option value="estimatedTaxDue">Sort: Est. tax (high→low)</option>
          <option value="confidence">Sort: Confidence (high→low)</option>
        </select>
        {cases && !error && <span className="text-xs text-slate-400">{total} case{total === 1 ? '' : 's'}</span>}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          Couldn’t load cases: {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {cases === null ? (
          <p className="text-xs text-slate-400 p-6">Loading…</p>
        ) : error ? (
          <p className="text-sm text-slate-500 p-8 text-center">No data to show while the list can’t be loaded.</p>
        ) : cases.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-slate-500">No cases match these filters.</p>
            <Link href="/scan" className="text-xs text-teal-700 hover:underline font-medium">Run a scan →</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50/50">
                  <th className="py-2.5 px-4 font-medium">Taxpayer</th>
                  <th className="py-2.5 px-4 font-medium text-right">Observed</th>
                  <th className="py-2.5 px-4 font-medium text-right">Declared</th>
                  <th className="py-2.5 px-4 font-medium text-right">Est. tax</th>
                  <th className="py-2.5 px-4 font-medium text-center">Conf.</th>
                  <th className="py-2.5 px-4 font-medium text-center">Risk</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 px-4">
                      <Link href={`/cases/${c.id}`} className="font-medium text-slate-800 hover:text-teal-700">
                        {caseDisplayName(c)}
                      </Link>
                      <div className="text-xs text-slate-400">
                        {c.taxpayer?.type} · {c.taxpayer?.stateOfResidence ?? '—'} · {c.year}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-600">{formatNaira(c.observedIncome)}</td>
                    <td className="py-2.5 px-4 text-right text-slate-600">{formatNaira(c.declaredIncome)}</td>
                    <td className="py-2.5 px-4 text-right font-semibold text-red-700">{formatNaira(c.estimatedTaxDue)}</td>
                    <td className="py-2.5 px-4 text-center text-slate-600">{Math.round(Number(c.confidence) * 100)}%</td>
                    <td className={`py-2.5 px-4 text-center font-medium ${RISK_TEXT[c.riskLevel]}`}>{c.riskLevel}</td>
                    <td className="py-2.5 px-4">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                        {STATUS_LABEL[c.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination — only when there is more than one page of results */}
      {cases && !error && total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-xs text-slate-500">Showing {from}–{to} of {total}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 disabled:opacity-40 hover:bg-slate-50"
            >
              Prev
            </button>
            <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 disabled:opacity-40 hover:bg-slate-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
