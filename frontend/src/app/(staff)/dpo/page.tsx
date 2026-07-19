'use client';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { ndpaApi, type DpoReport } from '@/lib/api/ndpa';
import { formatDate, extractErrorMessage } from '@/lib/utils';

export default function DpoPage() {
  const [r, setR] = useState<DpoReport | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setErr(null);
    ndpaApi.dpoReport().then(setR).catch((e) => { setR(null); setErr(extractErrorMessage(e)); });
  };
  useEffect(load, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader title="Data protection (NDPA 2023)" subtitle="DPO oversight: lawful basis, access events, and §28 storage-limitation status." />

      {err && (
        <div className="my-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between">
          <span>Couldn’t load the DPO report: {err}</span>
          <button onClick={load} className="text-xs text-teal-700 hover:underline font-medium">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 my-6">
        <StatCard label="PII access events" value={r?.accessOversight.piiAccessEvents?.toLocaleString() ?? '—'} hint="JIT-elevated reveals" />
        <StatCard label="Evidence exports" value={r?.accessOversight.evidenceExports?.toLocaleString() ?? '—'} />
        <StatCard label="Audit events" value={r?.accessOversight.totalAuditEvents?.toLocaleString() ?? '—'} tone="teal" />
        <StatCard label="Retention" value={r ? `${r.storageLimitation.retentionYears} yr` : '—'} hint={`${r?.storageLimitation.recordsPastRetention ?? 0} records past horizon`} tone={r && r.storageLimitation.recordsPastRetention > 0 ? 'amber' : 'default'} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">Control posture (NDPA §§25-28)</h3>
        {r ? (
          <dl className="text-sm space-y-2">
            <Row k="Lawful basis (§25)" v={r.lawfulBasis} />
            <Row k="Purpose limitation (§26)" v={r.purposeLimitation} />
            <Row k="Data minimisation (§26)" v={r.dataMinimisation} />
            <Row k="Encryption at rest" v={r.encryptionAtRest} />
            <Row k="Storage limitation (§28)" v={`${r.storageLimitation.retentionYears}-year retention; purge horizon ${formatDate(r.storageLimitation.cutoff)}; ${r.storageLimitation.purgesRun} purge run(s) on record.`} />
          </dl>
        ) : <p className="text-xs text-slate-400">{err ? 'Unavailable.' : 'Loading…'}</p>}
        <p className="text-xs text-slate-400 pt-3 border-t border-slate-100">
          Bank-report data past the retention horizon is purged automatically on a monthly schedule and recorded in the tamper-evident audit trail.
        </p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start gap-3">
      <dt className="text-slate-500 w-44 shrink-0">{k}</dt>
      <dd className="text-slate-800">{v}</dd>
    </div>
  );
}
