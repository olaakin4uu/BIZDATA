'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { Input, Select } from '@/components/Field';
import { StatusBadge } from '@/components/StatusBadge';
import {
  casesApi,
  formatNaira,
  caseDisplayName,
  type UnderdeclarationCase,
  type CaseStatus,
  type RiskLevel,
} from '@/lib/api/cases';
import { extractErrorMessage } from '@/lib/utils';
import { useStaffAuthStore } from '@/store/staffAuthStore';

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
  CRITICAL: 'text-[var(--bad)]',
  HIGH: 'text-[var(--warn)]',
  MEDIUM: 'text-[var(--ink-2)]',
  LOW: 'text-[var(--ink-3)]',
};

const STATUSES: CaseStatus[] = ['OPEN', 'UNDER_REVIEW', 'NOTICE_ISSUED', 'OBJECTION', 'CONFIRMED', 'SETTLED', 'RECOVERED', 'DISMISSED'];
const RISKS: RiskLevel[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const PAGE_SIZE = 50;
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];
type SortKey = 'estimatedTaxDue' | 'confidence';

function CasesListInner() {
  const params = useSearchParams();
  const router = useRouter();
  const userId = useStaffAuthStore((s) => s.user?.id);

  // Hydrate the year/status/riskLevel filters from the URL on mount so dashboard
  // drill-downs (e.g. ?status=OPEN&year=2026) land pre-filtered.
  const [status, setStatus] = useState<CaseStatus | ''>((params.get('status') as CaseStatus) || '');
  const [riskLevel, setRiskLevel] = useState<RiskLevel | ''>((params.get('riskLevel') as RiskLevel) || '');
  const [year, setYear] = useState<number | ''>(params.get('year') ? Number(params.get('year')) : '');
  const [sort, setSort] = useState<SortKey>('estimatedTaxDue');
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [cases, setCases] = useState<UnderdeclarationCase[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Debounce the search box so every keystroke doesn't fire a request — the
  // search now hits the server across all cases, not just the loaded page.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Reset to the first page whenever a server-side filter/sort changes.
  useEffect(() => { setPage(1); }, [status, riskLevel, year, sort, mine, debouncedQ]);

  useEffect(() => {
    let active = true;
    setCases(null); setError(null);
    casesApi
      .list({
        status: status || undefined,
        riskLevel: riskLevel || undefined,
        year: year || undefined,
        assignedToId: mine ? userId : undefined,
        q: debouncedQ || undefined,
        sort,
        page,
        limit: PAGE_SIZE,
      })
      .then((r) => { if (!active) return; setCases(r.cases); setTotal(r.total); })
      .catch((e) => { if (!active) return; setCases(null); setTotal(0); setError(extractErrorMessage(e)); });
    return () => { active = false; };
  }, [status, riskLevel, year, sort, mine, debouncedQ, page, userId, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Underdeclaration cases"
        subtitle="Prioritized worklist of taxpayers whose observed flows exceed their declared income."
      />

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <Input
          label="Search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Taxpayer name or TIN…"
          wrapperClassName="w-60"
        />
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as CaseStatus | '')}
          wrapperClassName="w-44"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
        <Select
          label="Risk level"
          value={riskLevel}
          onChange={(e) => setRiskLevel(e.target.value as RiskLevel | '')}
          wrapperClassName="w-40"
        >
          <option value="">All risk levels</option>
          {RISKS.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
        <Select
          label="Year"
          value={year}
          onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')}
          wrapperClassName="w-32"
        >
          <option value="">All years</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
        <Select
          label="Sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          wrapperClassName="w-56"
        >
          <option value="estimatedTaxDue">Est. tax (high→low)</option>
          <option value="confidence">Confidence (high→low)</option>
        </Select>
        <label className="inline-flex items-center gap-2 pb-2 text-sm text-[var(--ink-2)] select-none">
          <input
            type="checkbox"
            checked={mine}
            disabled={!userId}
            onChange={(e) => setMine(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--line)] text-teal-600 disabled:opacity-50"
          />
          Assigned to me
        </label>
        {cases && !error && (
          <span className="pb-2 text-xs text-[var(--ink-3)]">
            {total} case{total === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--line)] shadow-sm overflow-hidden">
        {error ? (
          <div className="p-8 text-center">
            <p className="text-sm text-[var(--bad)]">Couldn’t load cases: {error}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </Button>
          </div>
        ) : cases === null ? (
          <p className="text-xs text-[var(--ink-3)] p-6">Loading…</p>
        ) : cases.length === 0 ? (
          <div className="p-8 text-center">
            {debouncedQ ? (
              <p className="text-sm text-[var(--ink-2)]">No cases match “{debouncedQ}”.</p>
            ) : (
              <>
                <p className="text-sm text-[var(--ink-2)]">No cases match these filters.</p>
                <Link href="/scan" className="text-xs text-teal-700 hover:underline font-medium">Run a scan →</Link>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[var(--ink-3)] border-b border-[var(--line)] bg-[var(--surface-2)]">
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
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/cases/${c.id}`)}
                    className="border-b border-[var(--line)] hover:bg-[var(--surface-2)] cursor-pointer"
                  >
                    <td className="py-2.5 px-4">
                      {/* Real anchor keeps the row keyboard-navigable; the row onClick makes the whole row clickable by mouse. */}
                      <Link
                        href={`/cases/${c.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-[var(--ink)] hover:text-teal-700"
                      >
                        {caseDisplayName(c)}
                      </Link>
                      <div className="text-xs text-[var(--ink-3)]">
                        {c.taxpayer?.type} · {c.taxpayer?.stateOfResidence ?? '—'} · {c.year}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right text-[var(--ink-2)]">{formatNaira(c.observedIncome)}</td>
                    <td className="py-2.5 px-4 text-right text-[var(--ink-2)]">{formatNaira(c.declaredIncome)}</td>
                    <td className="py-2.5 px-4 text-right font-semibold text-[var(--bad)]">{formatNaira(c.estimatedTaxDue)}</td>
                    <td className="py-2.5 px-4 text-center text-[var(--ink-2)]">{Math.round(Number(c.confidence) * 100)}%</td>
                    <td className={`py-2.5 px-4 text-center font-medium ${RISK_TEXT[c.riskLevel]}`}>{c.riskLevel}</td>
                    <td className="py-2.5 px-4">
                      <StatusBadge status={c.status} label={STATUS_LABEL[c.status]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination — fully server-side, including while a search term is set. */}
      {cases && !error && total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-xs text-[var(--ink-3)]">Showing {from}–{to} of {total}</span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Prev
            </Button>
            <span className="text-xs text-[var(--ink-3)]">Page {page} of {totalPages}</span>
            <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CasesListPage() {
  // useSearchParams requires a Suspense boundary (CSR bailout) in production.
  return (
    <Suspense fallback={<div className="p-6 text-xs text-[var(--ink-3)]">Loading…</div>}>
      <CasesListInner />
    </Suspense>
  );
}
