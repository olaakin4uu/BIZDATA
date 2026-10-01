'use client';
import { Button } from '@/components/Button';

/**
 * "Still there?" countdown shown before an idle session is signed out. Driven
 * by hooks/useIdleTimeout. Deliberately not dismissable by Escape or the
 * backdrop — only the explicit "Stay signed in" keeps the session.
 */
interface IdleWarningDialogProps {
  open: boolean;
  secondsLeft: number;
  onStayLoggedIn: () => void;
  onLogoutNow: () => void;
}

export function IdleWarningDialog({ open, secondsLeft, onStayLoggedIn, onLogoutNow }: IdleWarningDialogProps) {
  if (!open) return null;

  const isUrgent = secondsLeft <= 15;
  const tone = isUrgent ? 'var(--bad)' : 'var(--warn)';
  const toneSoft = isUrgent ? 'var(--bad-soft)' : 'var(--warn-soft)';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-warning-title"
        aria-describedby="idle-warning-desc"
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--elev-3)]"
      >
        {/* Top accent bar */}
        <div className="h-1 w-full" style={{ background: tone }} />

        <div className="p-6">
          {/* Icon + title */}
          <div className="flex items-start gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
              style={{ background: toneSoft, color: tone }}
            >
              <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="idle-warning-title" className="text-base font-semibold text-[var(--ink)]">
                Session timeout warning
              </h2>
              <p id="idle-warning-desc" className="mt-1 text-sm text-[var(--ink-3)]">
                You&apos;ve been inactive. For your security, you will be signed out automatically.
              </p>
            </div>
          </div>

          {/* Countdown */}
          <div
            className="mt-5 flex items-center justify-center gap-2 rounded-xl py-4"
            style={{ background: toneSoft, color: tone }}
            aria-live="polite"
          >
            <span className="text-4xl font-bold tabular-nums">{secondsLeft}</span>
            <span className="text-sm font-medium">seconds</span>
          </div>

          {/* Actions */}
          <div className="mt-5 flex gap-3">
            <Button size="lg" className="flex-1" onClick={onStayLoggedIn} autoFocus>
              Stay signed in
            </Button>
            <Button size="lg" variant="secondary" onClick={onLogoutNow}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default IdleWarningDialog;
