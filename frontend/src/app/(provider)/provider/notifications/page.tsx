'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import Icon from '@/components/Icon';
import { providerPortalApi, type ProviderNotification } from '@/lib/api/provider-portal';
import { formatDateTime, extractErrorMessage } from '@/lib/utils';

const SEV: Record<string, string> = {
  CRITICAL: 'bg-rose-100 text-rose-800 ring-rose-200',
  WARNING: 'bg-amber-100 text-amber-800 ring-amber-200',
  INFO: 'bg-slate-100 text-slate-700 ring-slate-200',
};

// Where a notification points, by the entity the regulator attached to it.
const ACTION: Record<string, { href: string; label: string }> = {
  SUBMISSION_OVERDUE: { href: '/provider/submissions/new', label: 'File this return →' },
  RESUBMIT_PERMISSION: { href: '/provider/submissions/new', label: 'Upload the replacement →' },
};

export default function ProviderNotificationsPage() {
  const [rows, setRows] = useState<ProviderNotification[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () =>
    providerPortalApi.notifications()
      .then((r) => { setRows(r); setErr(null); })
      .catch((e) => { setRows([]); setErr(extractErrorMessage(e)); });

  useEffect(() => { load(); }, []);

  const markRead = async (id: string) => {
    // Optimistic: the row greys out immediately, then we re-read the server list.
    setRows((prev) => prev?.map((n) => (n.id === id ? { ...n, read: true } : n)) ?? prev);
    try { await providerPortalApi.markNotificationRead(id); } finally { load(); }
  };

  return (
    <div className="space-y-6 rise-in">
      <PageHeader
        title="Notifications"
        subtitle="Messages from the Tax Authority about your institution's filings — overdue returns and resubmission authorisations."
      />

      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Couldn’t load notifications: {err}{' '}
          <button onClick={load} className="font-medium underline hover:text-rose-800">Retry</button>
        </div>
      )}

      {rows === null && !err ? (
        <div className="pt-10"><LoadingSpinner /></div>
      ) : rows && rows.length === 0 && !err ? (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-6 py-10 text-center">
          <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--ink-3)]">
            <Icon name="bell" width={18} height={18} />
          </span>
          <p className="text-sm font-medium text-[var(--ink)]">Nothing to action</p>
          <p className="mt-0.5 text-sm text-[var(--ink-2)]">
            You’ll be notified here when a return becomes overdue or a resubmission is authorised.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
          {rows?.map((n) => {
            const action = ACTION[n.type];
            return (
              <div key={n.id} className={`flex items-start gap-3 px-5 py-4 ${n.read ? 'opacity-60' : ''}`}>
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${SEV[n.severity] ?? SEV.INFO}`}>
                  {n.severity}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--ink)]">{n.title}</p>
                  <p className="mt-0.5 text-sm text-[var(--ink-2)]">{n.message}</p>
                  <p className="mt-1 text-[11px] text-[var(--ink-3)]">{formatDateTime(n.createdAt)}</p>
                  {action && (
                    <Link href={action.href} className="mt-1.5 inline-block text-xs font-medium text-teal-700 hover:text-teal-800 hover:underline">
                      {action.label}
                    </Link>
                  )}
                </div>
                {!n.read && (
                  <button onClick={() => markRead(n.id)} className="shrink-0 text-xs font-medium text-teal-700 hover:underline">
                    Mark read
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
