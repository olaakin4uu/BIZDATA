'use client';
import { useEffect, useState } from 'react';
import { effectiveTheme, setTheme, type ThemeChoice } from '@/lib/theme';

/** Topbar light/dark switch. Reflects the effective theme on mount (the blocking
 *  script in the root layout has already applied the stored choice) and lets the
 *  user flip it. */
export default function ThemeToggle() {
  const [theme, setLocal] = useState<ThemeChoice>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLocal(effectiveTheme());
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: ThemeChoice = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setLocal(next);
  };

  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light theme' : 'Dark theme'}
      className="grid h-9 w-9 place-items-center rounded-lg text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-2)]"
    >
      {/* Render a stable icon until mounted to avoid a hydration mismatch. */}
      {mounted && isDark ? (
        <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  );
}
