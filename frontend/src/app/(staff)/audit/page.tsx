'use client';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import DataTable, { type Column } from '@/components/DataTable';
import { auditApi, type AuditLog } from '@/lib/api/audit';
import { formatDateTime } from '@/lib/utils';

const ACTOR_TYPES = ['STAFF', 'PROVIDER_USER', 'SYSTEM'];

export default function AuditPage() {
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actorType, setActorType] = useState('');
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const limit = 50;

  const load = () => {
    setLoading(true);
    auditApi.list({
      actorType: actorType || undefined,
      entity: entity || undefined,
      action: action || undefined,
      page,
      limit,
    })
      .then((r) => { setRows(r.logs); setTotal(r.total); })
      .catch(() => { setRows([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  useEffect(load, [page, actorType, entity, action]);

  const columns: Column<AuditLog>[] = [
    { key: 'when', header: 'When', cell: (r) => <span className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(r.createdAt)}</span> },
    { key: 'actor', header: 'Actor', cell: (r) => (
      <span className="text-xs">
        {r.staff ? `${r.staff.firstName} ${r.staff.lastName}` : <span className="text-slate-400">{r.actorType.toLowerCase()}</span>}
      </span>
    )},
    { key: 'type', header: 'Type', cell: (r) => <span className="text-xs font-mono text-slate-500">{r.actorType}</span> },
    { key: 'action', header: 'Action', cell: (r) => <span className="text-xs font-medium">{r.action}</span> },
    { key: 'entity', header: 'Entity', cell: (r) => <span className="text-xs">{r.entity}{r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ''}</span> },
    { key: 'ip', header: 'IP', cell: (r) => <span className="text-xs font-mono text-slate-500">{r.ip ?? '—'}</span> },
    { key: 'view', header: '', cell: (r) => (
      <button onClick={() => setSelected(r)} className="text-xs text-teal-700 hover:underline font-medium">View →</button>
    )},
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Audit log"
        subtitle="Tamper-evident hash-chained record of every privileged action."
      />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Actor type</label>
          <select value={actorType} onChange={(e) => { setActorType(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="">All</option>
            {ACTOR_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Entity</label>
          <input value={entity} onChange={(e) => setEntity(e.target.value)}
            onBlur={() => { setPage(1); load(); }}
            placeholder="e.g. DataRecord"
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Action</label>
          <input value={action} onChange={(e) => setAction(e.target.value)}
            onBlur={() => { setPage(1); load(); }}
            placeholder="e.g. LOGIN"
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        emptyText="No audit events match the filter."
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
      />

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Audit event {selected.id.slice(0, 8)}</h3>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-xs mb-4">
              <Row label="When" value={formatDateTime(selected.createdAt)} />
              <Row label="Actor type" value={selected.actorType} />
              <Row label="Action" value={selected.action} />
              <Row label="Entity" value={`${selected.entity}${selected.entityId ? ` (${selected.entityId})` : ''}`} />
              <Row label="IP" value={selected.ip ?? '—'} />
              <Row label="User agent" value={selected.userAgent ?? '—'} />
              <Row label="Hash prev" value={<span className="font-mono">{selected.hashChainPrev ?? '—'}</span>} />
              <Row label="Hash curr" value={<span className="font-mono">{selected.hashChainCurr ?? '—'}</span>} />
            </dl>
            {selected.beforeJson != null && (
              <details className="mb-2">
                <summary className="text-xs font-medium text-slate-700 cursor-pointer">Before</summary>
                <pre className="mt-2 bg-slate-50 border border-slate-200 rounded p-2 text-[10px] overflow-auto max-h-48">{JSON.stringify(selected.beforeJson, null, 2)}</pre>
              </details>
            )}
            {selected.afterJson != null && (
              <details>
                <summary className="text-xs font-medium text-slate-700 cursor-pointer">After</summary>
                <pre className="mt-2 bg-slate-50 border border-slate-200 rounded p-2 text-[10px] overflow-auto max-h-48">{JSON.stringify(selected.afterJson, null, 2)}</pre>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-800 mt-0.5 break-words">{value}</dd>
    </div>
  );
}
