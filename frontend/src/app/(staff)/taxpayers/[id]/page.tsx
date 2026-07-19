'use client';
import { useEffect, useState, use as usePromise } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import SensitiveValue from '@/components/SensitiveValue';
import { taxpayersApi, type Taxpayer } from '@/lib/api/taxpayers';
import { dataRecordsApi, type DataRecord } from '@/lib/api/data-records';
import {
  formatDate, formatMoney, formatPercent, statusBadge, extractErrorMessage,
} from '@/lib/utils';

type Params = Promise<{ id: string }>;

function tpName(t: Taxpayer | null): string {
  if (!t) return '—';
  if (t.type === 'INDIVIDUAL') return `${t.firstName ?? ''} ${t.lastName ?? ''}`.trim() || '—';
  return t.businessName ?? '—';
}

export default function TaxpayerDetailPage({ params }: { params: Params }) {
  const { id } = usePromise(params);
  const [tp, setTp] = useState<Taxpayer | null>(null);
  const [records, setRecords] = useState<DataRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      taxpayersApi.get(id).catch((e) => { setErr(extractErrorMessage(e)); return null; }),
      dataRecordsApi.list({ taxpayerId: id, limit: 50 }).then((r) => r.records).catch(() => []),
    ])
      .then(([t, recs]) => {
        setTp(t);
        setRecords(recs);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-6"><LoadingSpinner /></div>;
  if (!tp) return (
    <div className="p-6">
      <PageHeader title="Taxpayer" actions={<Link href="/taxpayers" className="text-sm text-slate-600 hover:text-slate-900">← Back</Link>} />
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{err ?? 'Not found'}</div>
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title={tpName(tp)}
        subtitle={`${tp.type} · ${tp.tin ?? tp.nin ?? tp.cacRcNumber ?? 'unidentified'}`}
        actions={
          <>
            <Link href="/taxpayers" className="text-sm text-slate-600 hover:text-slate-900">← All taxpayers</Link>
            <button onClick={() => setEditing((v) => !v)} className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
              {editing ? 'Cancel edit' : 'Edit'}
            </button>
          </>
        }
      />

      {editing ? (
        <EditForm tp={tp} onSaved={(t) => { setTp(t); setEditing(false); }} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Info label="Status" value={
            <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge(tp.status)}`}>{tp.status}</span>
          } />
          <Info label="Risk" value={`${tp.riskLevel} (${tp.riskScore})`} />
          <Info label="NIN" value={<SensitiveValue value={tp.nin} />} />
          <Info label="BVN" value={<SensitiveValue value={(tp as { bvn?: string | null }).bvn} />} />
          <Info label="CAC RC" value={tp.cacRcNumber ?? '—'} />
          <Info label="TIN" value={tp.tin ?? '—'} />
          <Info label="Phone" value={tp.phone ?? '—'} />
          <Info label="Email" value={tp.email ?? '—'} />
          <Info label="State" value={tp.stateOfResidence ?? '—'} />
          <Info label="Address" value={tp.address ?? '—'} className="md:col-span-4" />
        </div>
      )}

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Declared income</h2>
        {tp.declaredIncomes && tp.declaredIncomes.length > 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Year', 'Assessable income', 'Source', 'Notes'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tp.declaredIncomes.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-3 font-mono text-xs">{d.year}</td>
                    <td className="px-4 py-3 font-medium">{formatMoney(d.assessableIncome)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{d.source ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{d.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-8 text-center text-xs text-slate-400">
            No declared income on record.
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Data records</h2>
        {records.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-8 text-center text-xs text-slate-400">
            No data records linked to this taxpayer yet.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Period', 'Provider', 'Inflow', 'Declared', 'Discrepancy', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => (
                  <tr key={r.id} className={r.flaggedAsUnderdeclared && r.reviewStatus === 'PENDING_REVIEW' ? 'bg-red-50/30' : ''}>
                    <td className="px-4 py-3 font-mono text-xs">{r.periodLabel}</td>
                    <td className="px-4 py-3 text-xs">{r.provider?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs font-medium">{formatMoney(r.totalInflow)}</td>
                    <td className="px-4 py-3 text-xs">{formatMoney(r.declaredIncome)}</td>
                    <td className={`px-4 py-3 text-xs ${r.flaggedAsUnderdeclared ? 'text-red-700 font-semibold' : 'text-slate-400'}`}>
                      {r.flaggedAsUnderdeclared
                        ? `${formatMoney(r.discrepancyAmount)} (${formatPercent(r.discrepancyPct, 0)})`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {r.reviewStatus ? (
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge(r.reviewStatus)}`}>
                          {r.reviewStatus.replace(/_/g, ' ')}
                        </span>
                      ) : (<span className="text-xs text-slate-400">—</span>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Info({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm p-4 ${className ?? ''}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="text-sm text-slate-800 mt-1">{value}</div>
    </div>
  );
}

function EditForm({ tp, onSaved }: { tp: Taxpayer; onSaved: (t: Taxpayer) => void }) {
  const [form, setForm] = useState({
    firstName: tp.firstName ?? '',
    lastName: tp.lastName ?? '',
    middleName: tp.middleName ?? '',
    businessName: tp.businessName ?? '',
    tin: tp.tin ?? '',
    phone: tp.phone ?? '',
    email: tp.email ?? '',
    address: tp.address ?? '',
    stateOfResidence: tp.stateOfResidence ?? '',
    status: tp.status,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const updated = await taxpayersApi.update(tp.id, form);
      onSaved(updated);
    } catch (err) {
      setError(extractErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4 mb-6">
      {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tp.type === 'INDIVIDUAL' ? (
          <>
            <Text label="First name" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
            <Text label="Last name" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} />
            <Text label="Middle name" value={form.middleName} onChange={(v) => setForm({ ...form, middleName: v })} />
          </>
        ) : (
          <Text label="Business name" value={form.businessName} onChange={(v) => setForm({ ...form, businessName: v })} className="md:col-span-2" />
        )}
        <Text label="TIN" value={form.tin} onChange={(v) => setForm({ ...form, tin: v })} />
        <Text label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <Text label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <Text label="State" value={form.stateOfResidence} onChange={(v) => setForm({ ...form, stateOfResidence: v })} />
        <Text label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} className="md:col-span-2" />
      </div>
      <button type="submit" disabled={busy} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}

function Text({ label, value, onChange, className }: { label: string; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
    </div>
  );
}
