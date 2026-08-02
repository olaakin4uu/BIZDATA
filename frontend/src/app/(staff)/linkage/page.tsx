'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import LoadingSpinner from '@/components/LoadingSpinner';
import {
  linkageApi,
  type IdentifierLinkageRow,
  type NameLinkageRow,
  type LinkageResult,
} from '@/lib/api/linkage';
import { formatMoneyShort, extractErrorMessage } from '@/lib/utils';

type Tab = 'identifier' | 'name';

const YEARS = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);

const AGREEMENT: Record<string, { label: string; cls: string; hint: string }> = {
  SAME_ID: {
    label: 'Same ID', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    hint: 'Every account under this name carries the same NIN/BVN — one person, confirmed by identifier.',
  },
  CONFLICTING: {
    label: 'Conflicting IDs', cls: 'bg-amber-100 text-amber-800 ring-amber-200',
    hint: 'Several identifiers share this name. Usually namesakes; occasionally one person under more than one identity. Needs review.',
  },
  NO_ID: {
    label: 'No ID', cls: 'bg-slate-100 text-slate-600 ring-slate-200',
    hint: 'No NIN or BVN on these records, so nothing corroborates the name. Weakest lead.',
  },
};

export default function LinkagePage() {
  const [tab, setTab] = useState<Tab>('identifier');
  const [year, setYear] = useState<number | ''>('');
  const [minAccounts, setMinAccounts] = useState(2);
  const [multiProviderOnly, setMultiProviderOnly] = useState(false);
  const [byId, setById] = useState<LinkageResult<IdentifierLinkageRow> | null>(null);
  const [byName, setByName] = useState<LinkageResult<NameLinkageRow> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const q = { year: year || undefined, minAccounts, multiProviderOnly, limit: 200 };
    setErr(null);
    if (tab === 'identifier') {
      setById(null);
      linkageApi.byIdentifier(q).then(setById).catch((e) => setErr(extractErrorMessage(e)));
    } else {
      setByName(null);
      linkageApi.byName(q).then(setByName).catch((e) => setErr(extractErrorMessage(e)));
    }
  }, [tab, year, minAccounts, multiProviderOnly]);

  const result = tab === 'identifier' ? byId : byName;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 px-7 py-6 mb-6 shadow-lg">
        <div className="pointer-events-none absolute -top-10 -right-10 h-52 w-52 rounded-full bg-teal-500/10" />
        <div className="relative">
          <p className="text-xs uppercase tracking-widest text-teal-300 mb-1">Account Linkage</p>
          <h1 className="text-2xl font-bold text-white">One customer, many accounts</h1>
          <p className="text-sm text-slate-300 mt-1 max-w-3xl">
            Customers holding more than one account — within a single institution and across several. Matched on the
            identifier the provider reported, or on the name written on the account.
          </p>
        </div>
      </div>

      {/* Tabs + filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
          {([['identifier', 'By identifier (NIN / BVN)'], ['name', 'By name']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === key ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5 text-slate-600">
            Year
            <select value={year} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')}
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
              <option value="">All</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-slate-600">
            Min accounts
            <input type="number" min={2} value={minAccounts}
              onChange={(e) => setMinAccounts(Math.max(2, Number(e.target.value) || 2))}
              className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <label className="flex items-center gap-1.5 text-slate-600">
            <input type="checkbox" checked={multiProviderOnly}
              onChange={(e) => setMultiProviderOnly(e.target.checked)} />
            Across providers only
          </label>
        </div>
      </div>

      {tab === 'name' && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-[var(--warn-soft)] px-4 py-3 text-sm text-amber-800">
          <strong>Names are a weak key.</strong> Two unrelated people share a name easily, and one person is written
          several ways. Each row is scored by whether the identifiers underneath it agree — treat these as leads to
          review, never as findings on their own.
        </p>
      )}

      {err && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</div>}

      {!result && !err ? (
        <div className="pt-12"><LoadingSpinner /></div>
      ) : result && result.rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">No customer matches these filters</p>
          <p className="mt-1 text-sm text-slate-500">
            Only reportable taxpayers (§29 threshold) are included. Try clearing the year or the across-providers filter.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          {tab === 'identifier' ? <IdentifierTable rows={byId?.rows ?? []} /> : <NameTable rows={byName?.rows ?? []} />}
        </div>
      )}

      {result?.truncated && (
        <p className="mt-2 text-xs text-slate-500">
          Showing the top {result.rows.length} by provider spread, then account count. Narrow the filters to see more.
        </p>
      )}
    </div>
  );
}

function IdentifierTable({ rows }: { rows: IdentifierLinkageRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th className="px-4 py-3">Identifier</th>
          <th className="px-4 py-3">Names on the accounts</th>
          <th className="px-4 py-3 text-right">Accounts</th>
          <th className="px-4 py-3 text-right">Providers</th>
          <th className="px-4 py-3 text-right">Inflow</th>
          <th className="px-4 py-3 text-right">Flagged</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((r) => (
          <tr key={`${r.idType}-${r.idRef}`} className="align-top hover:bg-slate-50/60">
            <td className="px-4 py-3">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">{r.idType}</span>
              <span className="ml-1.5 font-mono text-xs text-slate-500">{r.idRef}…</span>
              {r.taxpayers > 1 && (
                <span
                  title="This one identifier is split across several taxpayer records — an entity-resolution defect worth fixing before acting on the row."
                  className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-700"
                >
                  {r.taxpayers} taxpayer records
                </span>
              )}
              <p className="mt-1 text-[11px] text-slate-400">{r.firstYear === r.lastYear ? r.firstYear : `${r.firstYear}–${r.lastYear}`} · {r.records} records</p>
            </td>
            <td className="px-4 py-3">
              <p className="text-slate-800">{r.names[0] ?? '—'}</p>
              {r.names.length > 1 && (
                <p className="mt-0.5 text-xs text-slate-500">also: {r.names.slice(1).join(' · ')}</p>
              )}
            </td>
            <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">{r.accounts}</td>
            <td className="px-4 py-3 text-right tabular-nums">
              <span className={r.providers > 1 ? 'font-semibold text-teal-700' : 'text-slate-700'}>{r.providers}</span>
              <p className="text-[11px] text-slate-400">{r.providerNames.join(', ')}</p>
            </td>
            <td className="px-4 py-3 text-right tabular-nums text-slate-800">{formatMoneyShort(r.inflow)}</td>
            <td className="px-4 py-3 text-right tabular-nums text-slate-600">{r.flagged}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NameTable({ rows }: { rows: NameLinkageRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th className="px-4 py-3">Name</th>
          <th className="px-4 py-3">Identifier agreement</th>
          <th className="px-4 py-3 text-right">Accounts</th>
          <th className="px-4 py-3 text-right">Providers</th>
          <th className="px-4 py-3 text-right">Inflow</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((r) => {
          const a = AGREEMENT[r.idAgreement] ?? AGREEMENT.NO_ID;
          return (
            <tr key={r.nameKey} className="align-top hover:bg-slate-50/60">
              <td className="px-4 py-3">
                <p className="font-medium text-slate-800">{r.nameVariants[0] ?? r.nameKey}</p>
                {r.nameVariants.length > 1 && (
                  <p className="mt-0.5 text-xs text-slate-500">also written: {r.nameVariants.slice(1).join(' · ')}</p>
                )}
                <p className="mt-0.5 font-mono text-[11px] text-slate-400">key: {r.nameKey}</p>
              </td>
              <td className="px-4 py-3">
                <span title={a.hint} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${a.cls}`}>{a.label}</span>
                <p className="mt-1 text-[11px] text-slate-400">
                  {r.distinctIds} distinct identifier{r.distinctIds === 1 ? '' : 's'} · {r.records} records
                </p>
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">{r.accounts}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                <span className={r.providers > 1 ? 'font-semibold text-teal-700' : 'text-slate-700'}>{r.providers}</span>
                <p className="text-[11px] text-slate-400">{r.providerNames.join(', ')}</p>
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-800">{formatMoneyShort(r.inflow)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
