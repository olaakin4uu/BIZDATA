'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notificationsApi, type Notification } from '@/lib/api/notifications';

const SEV_DOT: Record<Notification['severity'], string> = {
  CRITICAL: 'bg-[var(--bad)]',
  WARNING: 'bg-[var(--warn)]',
  INFO: 'bg-[var(--info)]',
};

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

/** Topbar notifications bell: unread badge + popover. Surfaces the Alerts that
 *  were previously reachable only via sidebar item #24 with no unread indicator. */
export default function NotificationsBell() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => notificationsApi.list().then(setItems).catch(() => setItems([]));
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const unread = (items ?? []).filter((n) => !n.read);
  const unreadCount = unread.length;
  const recent = (items ?? []).slice(0, 6);

  const openItem = async (n: Notification) => {
    if (!n.read) {
      setItems((prev) => (prev ? prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)) : prev));
      notificationsApi.markRead(n.id).catch(() => {});
    }
    setOpen(false);
    router.push('/notifications');
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        className="relative grid h-9 w-9 place-items-center rounded-lg text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-2)]"
      >
        <svg viewBox="0 0 24 24" width={19} height={19} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-[var(--bad)] px-1 text-[10px] font-semibold leading-4 text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-80 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--elev-3)] z-50"
        >
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
            <p className="text-sm font-semibold text-[var(--ink)]">Notifications</p>
            {unreadCount > 0 && (
              <span className="rounded-full bg-[var(--bad-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--bad)]">
                {unreadCount} unread
              </span>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items === null ? (
              <p className="px-4 py-6 text-center text-xs text-[var(--ink-3)]">Loading…</p>
            ) : recent.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[var(--ink-2)]">You’re all caught up.</p>
            ) : (
              recent.map((n) => (
                <button
                  key={n.id}
                  role="menuitem"
                  onClick={() => openItem(n)}
                  className={`flex w-full items-start gap-2.5 border-b border-[var(--line-2)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-2)] ${
                    n.read ? '' : 'bg-[var(--surface-2)]/60'
                  }`}
                >
                  <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${n.read ? 'bg-[var(--line)]' : SEV_DOT[n.severity]}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${n.read ? 'text-[var(--ink-2)]' : 'font-medium text-[var(--ink)]'}`}>
                      {n.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--ink-3)]">{n.message}</span>
                    <span className="mt-0.5 block text-[11px] text-[var(--ink-3)]">{relTime(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
          <button
            onClick={() => {
              setOpen(false);
              router.push('/notifications');
            }}
            className="block w-full border-t border-[var(--line)] px-4 py-2.5 text-center text-sm font-medium text-teal-700 transition-colors hover:bg-[var(--surface-2)]"
          >
            View all alerts
          </button>
        </div>
      )}
    </div>
  );
}
