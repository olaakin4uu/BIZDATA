'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/Button';
import StatusBadge from '@/components/StatusBadge';
import { extractErrorMessage } from '@/lib/utils';
import {
  ACTION_LABEL,
  APPLYABLE,
  actionTone,
  type TriageRecommendation,
} from '@/lib/api/triage';

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;
const pctf = (n: number) => `${Math.round(n * 100)}%`;

export default function TriageCard({
  rec,
  onApply,
  onSkip,
}: {
  rec: TriageRecommendation;
  onApply: (rec: TriageRecommendation) => Promise<void>;
  onSkip: (rec: TriageRecommendation) => Promise<void>;
}) {
  const [busy, setBusy] = useState<null | 'apply' | 'skip'>(null);
  const [error, setError] = useState<string | null>(null);
  const snap = rec.caseSnapshot;
  const applyable = APPLYABLE.includes(rec.action);
  const done = rec.status !== 'PENDING';

  const doApply = async () => {
    if (rec.action === 'ISSUE_NOTICE' && !window.confirm('This issues a binding §35 Best-of-Judgement assessment notice and starts the taxpayer’s objection window. Proceed?')) return;
    setBusy('apply');
    setError(null);
    try {
      await onApply(rec);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const doSkip = async () => {
    setBusy('skip');
    setError(null);
    try {
      await onSkip(rec);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`rounded-2xl border bg-[var(--surface)] p-5 shadow-[var(--elev-1)] ${done ? 'border-[var(--line)] opacity-75' : 'border-[var(--line)]'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {snap ? (
              <Link href={`/cases/${rec.caseId}`} className="truncate text-sm font-semibold text-[var(--ink)] hover:text-teal-700">{snap.taxpayer}</Link>
            ) : (
              <span className="text-sm font-semibold text-[var(--ink)]">Case</span>
            )}
            {snap && <StatusBadge status={snap.status} />}
            {snap && <span className="text-xs text-[var(--ink-3)]">{snap.year} · {snap.riskLevel}</span>}
          </div>
          {snap && (
            <p className="mt-1 text-xs text-[var(--ink-2)]">
              Est. tax <span className="font-semibold text-[var(--ink)]">{naira(snap.estimatedTaxDue)}</span> · gap {pctf(snap.discrepancyPct)} · confidence {pctf(snap.confidence)}
            </p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${actionTone(rec.action)}`}>
          {ACTION_LABEL[rec.action]}
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-[var(--ink-2)]">{rec.rationale}</p>

      {rec.keyEvidence.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">Key evidence</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {rec.keyEvidence.map((e, i) => (
              <li key={i} className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-xs text-[var(--ink-2)]">{e}</li>
            ))}
          </ul>
        </div>
      )}

      {rec.risks.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--warn)]">What could weaken this</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-[var(--ink-2)]">
            {rec.risks.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {rec.statutoryNotes && <p className="mt-3 text-[11px] text-[var(--ink-3)]">{rec.statutoryNotes}</p>}

      {error && <p className="mt-3 rounded-lg bg-[var(--bad-soft)] px-3 py-2 text-sm text-[var(--bad)]">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line-2)] pt-3">
        <span className="text-[11px] text-[var(--ink-3)]">Priority {rec.priority} · {rec.model === 'heuristic' ? 'rule-based' : 'IRIS'}</span>
        {done ? (
          <span className={`text-xs font-medium ${rec.status === 'APPLIED' ? 'text-[var(--ok)]' : 'text-[var(--ink-3)]'}`}>
            {rec.status === 'APPLIED' ? `Applied → ${(rec.appliedTo ?? '').replace(/_/g, ' ').toLowerCase()}` : rec.status.toLowerCase()}
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <Link href={`/cases/${rec.caseId}`} className="text-xs font-medium text-[var(--ink-2)] hover:text-[var(--ink)]">Open case</Link>
            <Button variant="ghost" size="sm" onClick={doSkip} loading={busy === 'skip'}>Skip</Button>
            {applyable && (
              <Button
                size="sm"
                variant={rec.action === 'ISSUE_NOTICE' ? 'danger' : 'primary'}
                onClick={doApply}
                loading={busy === 'apply'}
              >
                Approve &amp; apply
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
