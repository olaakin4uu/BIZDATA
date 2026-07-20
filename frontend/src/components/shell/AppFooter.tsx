'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { APP_NAME } from '@/lib/appName';
import { APP_VERSION, APP_BUILD, APP_ENV, IS_PROD, SUPPORT_EMAIL } from '@/lib/appMeta';

/** Persistent status bar. Anchors version/build, environment, the confidentiality
 *  classification (a government-system expectation), legal + support links, and a
 *  live connection indicator — none of which existed before. */
export default function AppFooter() {
  const [online, setOnline] = useState(true);
  const [year, setYear] = useState('');

  useEffect(() => {
    setOnline(navigator.onLine);
    setYear(String(new Date().getFullYear()));
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return (
    <footer className="flex flex-shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-[11px] text-[var(--ink-3)] sm:px-6">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>© {year} {APP_NAME}</span>
        <span aria-hidden>·</span>
        <span className="tnum font-mono">v{APP_VERSION}{APP_BUILD ? `+${APP_BUILD}` : ''}</span>
        {!IS_PROD && (
          <span className="rounded bg-[var(--warn-soft)] px-1.5 py-0.5 font-semibold uppercase tracking-wide text-[var(--warn)]">
            {APP_ENV}
          </span>
        )}
        <span className="hidden md:inline text-[var(--ink-3)]/80">· OFFICIAL — Confidential · authorised users only</span>
      </div>

      <div className="flex items-center gap-3">
        <Link href="/dpo" className="transition-colors hover:text-[var(--ink)]">Data protection</Link>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="transition-colors hover:text-[var(--ink)]">Support</a>
        <span className="flex items-center gap-1.5" title={online ? 'Connected' : 'No connection'}>
          <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-[var(--ok)]' : 'bg-[var(--bad)]'}`} aria-hidden />
          {online ? 'Online' : 'Offline'}
        </span>
      </div>
    </footer>
  );
}
