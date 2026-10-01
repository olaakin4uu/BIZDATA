'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

// Idle sign-out measured on the WALL CLOCK, not with a running countdown.
//
// The previous version only counted while a setTimeout was alive. Phones
// suspend timers when the app goes to the background or the screen locks,
// desktop browsers throttle background tabs, a sleeping laptop stops them, and
// closing the tab throws them away — so a session left alone was never signed
// out, and reopening the app days later carried straight on. For a financial
// app that is the case that matters.
//
// Now the time of the last activity is written to localStorage (shared by every
// tab of the same app), and elapsed time is checked on a short interval AND the
// moment the page becomes visible again (resume, unlock, tab switch, reopen).
// Anything past the limit signs out at once, with no warning to sit through.

const IDLE_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'click',
  'wheel',
];

/** Activity is recorded at most this often (mousemove fires constantly). */
const WRITE_THROTTLE_MS = 5_000;
const CHECK_INTERVAL_MS = 1_000;

function readLastActivity(storageKey: string): number | null {
  try {
    const v = Number(localStorage.getItem(storageKey));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function writeLastActivity(storageKey: string, at: number): void {
  try {
    localStorage.setItem(storageKey, String(at));
  } catch {
    // Storage unavailable (private mode): the in-memory timestamp still applies.
  }
}

/** Forget the activity clock — call on sign-in so an old timestamp can't expire a fresh session. */
export function resetIdleClock(storageKey: string): void {
  writeLastActivity(storageKey, Date.now());
}

/**
 * True when this device's last recorded activity is older than `limitMs`.
 * No record counts as not expired (first use, or storage unavailable).
 */
export function isIdleExpired(storageKey: string, limitMs: number): boolean {
  const last = readLastActivity(storageKey);
  return last !== null && Date.now() - last >= limitMs;
}

interface UseIdleTimeoutOptions {
  /** Milliseconds of inactivity before showing the warning dialog */
  idleMs: number;
  /** Milliseconds the warning dialog shows before auto-logout */
  warningMs: number;
  /** Called when the session has been idle for idleMs + warningMs */
  onLogout: () => void;
  /** Whether the timeout is active (disable on login page, etc.) */
  enabled?: boolean;
  /** localStorage key holding the last-activity time; one per app (staff / portal). */
  storageKey?: string;
}

interface UseIdleTimeoutReturn {
  /** Warning dialog is showing */
  isWarning: boolean;
  /** Seconds remaining in the countdown (only meaningful when isWarning=true) */
  secondsLeft: number;
  /** Reset the idle timer (user clicked "Stay logged in") */
  stayLoggedIn: () => void;
}

export function useIdleTimeout({
  idleMs,
  warningMs,
  onLogout,
  enabled = true,
  storageKey = 'idle.lastActivity',
}: UseIdleTimeoutOptions): UseIdleTimeoutReturn {
  const [isWarning, setIsWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.floor(warningMs / 1000));

  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;
  const isWarningRef = useRef(false);
  const lastWriteRef = useRef(0);
  const loggedOutRef = useRef(false);

  const recordActivity = useCallback(
    (force = false) => {
      const now = Date.now();
      if (!force && now - lastWriteRef.current < WRITE_THROTTLE_MS) return;
      lastWriteRef.current = now;
      writeLastActivity(storageKey, now);
    },
    [storageKey],
  );

  const check = useCallback(() => {
    if (loggedOutRef.current) return;
    const last = readLastActivity(storageKey) ?? lastWriteRef.current;
    if (!last) return;
    const elapsed = Date.now() - last;

    if (elapsed >= idleMs + warningMs) {
      loggedOutRef.current = true;
      isWarningRef.current = false;
      setIsWarning(false);
      onLogoutRef.current();
      return;
    }
    if (elapsed >= idleMs) {
      if (!isWarningRef.current) {
        isWarningRef.current = true;
        setIsWarning(true);
      }
      setSecondsLeft(Math.max(0, Math.ceil((idleMs + warningMs - elapsed) / 1000)));
      return;
    }
    // Activity in another tab (shared timestamp) clears this tab's warning.
    if (isWarningRef.current) {
      isWarningRef.current = false;
      setIsWarning(false);
    }
  }, [idleMs, warningMs, storageKey]);

  const stayLoggedIn = useCallback(() => {
    recordActivity(true);
    isWarningRef.current = false;
    setIsWarning(false);
  }, [recordActivity]);

  useEffect(() => {
    if (!enabled) return;
    loggedOutRef.current = false;

    // Opening (or reopening) the app: a session idle past the limit while the
    // app was closed or backgrounded ends now, before anything is shown.
    if (readLastActivity(storageKey) === null) recordActivity(true);
    check();

    const handleActivity = () => {
      // While the warning shows, only the button keeps the session.
      if (!isWarningRef.current) recordActivity();
    };
    const handleResume = () => {
      if (document.visibilityState === 'visible') check();
    };

    IDLE_EVENTS.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }));
    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    const interval = setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      IDLE_EVENTS.forEach((event) => window.removeEventListener(event, handleActivity));
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
      clearInterval(interval);
    };
  }, [enabled, storageKey, check, recordActivity]);

  return { isWarning, secondsLeft, stayLoggedIn };
}
