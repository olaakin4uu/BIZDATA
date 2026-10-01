'use client';
import { useState } from 'react';
import Icon from '@/components/Icon';
import { Button } from '@/components/Button';
import { extractErrorMessage } from '@/lib/utils';
import { triageApi, type TriageRecommendation } from '@/lib/api/triage';
import TriageCard from '@/components/triage/TriageCard';

/**
 * Per-case "Investigate with IRIS" — drops into the case detail. Produces one
 * triage recommendation; approving applies the transition through the normal path.
 */
export default function CaseTriagePanel({ caseId }: { caseId: string }) {
  const [rec, setRec] = useState<TriageRecommendation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const investigate = async () => {
    setBusy(true);
    setError(null);
    try {
      setRec(await triageApi.investigate(caseId));
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onApply = async (r: TriageRecommendation) => {
    const res = await triageApi.apply(r.id);
    setRec((prev) => (prev ? { ...prev, status: res.recommendation.status, appliedTo: res.recommendation.appliedTo } : prev));
  };
  const onSkip = async (r: TriageRecommendation) => {
    await triageApi.skip(r.id);
    setRec((prev) => (prev ? { ...prev, status: 'SKIPPED' } : prev));
  };

  if (!rec) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--elev-1)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-600 text-white"><Icon name="robot" width={16} height={16} /></span>
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">Investigate with IRIS</p>
              <p className="text-[11px] text-[var(--ink-3)]">Get a recommended next action + rationale</p>
            </div>
          </div>
          <Button size="sm" onClick={investigate} loading={busy}>Investigate</Button>
        </div>
        {error && <p className="mt-3 rounded-lg bg-[var(--bad-soft)] px-3 py-2 text-sm text-[var(--bad)]">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <TriageCard rec={rec} onApply={onApply} onSkip={onSkip} />
      <button onClick={investigate} className="text-xs font-medium text-[var(--ink-2)] hover:text-[var(--ink)]" disabled={busy}>
        {busy ? 'Re-investigating…' : 'Re-investigate'}
      </button>
    </div>
  );
}
