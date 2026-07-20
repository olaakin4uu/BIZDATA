import React from 'react';
import { statusBadge } from '@/lib/utils';

/**
 * The single status-pill primitive. Owns the shell geometry (previously copied
 * 15+ times with drift, e.g. text-[10px] on one page) plus colour and the
 * humanized label (`PENDING_REVIEW` → `Pending review`). Colour comes from the
 * shared `statusBadge()` map so semantics stay consistent app-wide.
 */
export interface StatusBadgeProps {
  status?: string | null;
  /** Override the displayed label; defaults to the humanized status. */
  label?: string;
  className?: string;
}

function humanize(status?: string | null): string {
  if (!status) return '—';
  const s = status.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function StatusBadge({ status, label, className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(status)} ${className}`}
    >
      {label ?? humanize(status)}
    </span>
  );
}

export default StatusBadge;
