'use client';
import React, { useEffect, useId, useRef } from 'react';

/**
 * The single accessible dialog primitive. Replaces 6 hand-rolled `fixed inset-0`
 * overlays that declared no `role="dialog"`, trapped no focus, and handled
 * Escape inconsistently. Provides: `role="dialog"` + `aria-modal`, a labelled
 * title, focus trap (Tab/Shift-Tab cycle within), Escape-to-close, focus
 * restoration on close, and a body-scroll lock.
 */
export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Max-width class for the panel. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Set false to require the explicit close control (no backdrop dismiss). */
  dismissOnBackdrop?: boolean;
}

const SIZE: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, footer, size = 'md', dismissOnBackdrop = true }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const node = panelRef.current;
    const focusables = () =>
      node
        ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
        : [];
    (focusables()[0] ?? node)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const f = focusables();
        if (f.length === 0) {
          e.preventDefault();
          node?.focus();
          return;
        }
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onMouseDown={dismissOnBackdrop ? (e) => e.target === e.currentTarget && onClose() : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`w-full ${SIZE[size]} max-h-[90vh] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--elev-3)] outline-none flex flex-col rise-in`}
      >
        {title && (
          <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
            <h2 id={titleId} className="text-base font-semibold text-[var(--ink)]">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="-mr-1 rounded-md p-1 text-[var(--ink-3)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            >
              <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        )}
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-[var(--line)] bg-[var(--surface-2)] px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export default Modal;
