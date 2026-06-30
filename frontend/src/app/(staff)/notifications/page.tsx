'use client';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { notificationsApi, type Notification } from '@/lib/api/notifications';
import { useStaffAuthStore } from '@/store/staffAuthStore';
import { formatDateTime } from '@/lib/utils';

const SEV: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800',
  WARNING: 'bg-amber-100 text-amber-800',
  INFO: 'bg-slate-100 text-slate-700',
};

export default function NotificationsPage() {
  const role = useStaffAuthStore((s) => s.user?.role);
  const canGenerate = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'].includes(role ?? '');
  const [rows, setRows] = useState<Notification[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => notificationsApi.list().then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const generate = async () => {
    setBusy(true); setMsg(null);
    try { const r = await notificationsApi.generate(2025); setMsg(`${r.created} new alert(s)`); load(); }
    catch { setMsg('Failed'); } finally { setBusy(false); }
  };
  const markRead = async (id: string) => { await notificationsApi.markRead(id); load(); };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <PageHeader title="Alerts" subtitle="High-value flags, missing submissions, and approaching §41 deadlines." />
        {canGenerate && (
          <button onClick={generate} disabled={busy} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50">
            {busy ? 'Scanning…' : 'Run alert scan'}
          </button>
        )}
      </div>
      {msg && <p className="text-xs text-teal-700 mb-2">{msg}</p>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100 mt-4">
        {rows === null ? (
          <p className="text-xs text-slate-400 p-6">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-slate-400 p-6">No alerts. Run the alert scan to generate them.</p>
        ) : rows.map((n) => (
          <div key={n.id} className={`p-4 flex items-start gap-3 ${n.read ? 'opacity-60' : ''}`}>
            <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${SEV[n.severity] ?? SEV.INFO}`}>{n.severity}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">{n.title}</p>
              <p className="text-xs text-slate-500">{n.message}</p>
              <p className="text-[11px] text-slate-400 mt-1">{n.type} · {formatDateTime(n.createdAt)}</p>
            </div>
            {!n.read && <button onClick={() => markRead(n.id)} className="text-xs text-teal-700 hover:underline shrink-0">Mark read</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
