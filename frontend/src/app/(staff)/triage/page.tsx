'use client';
import { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { Select } from '@/components/Field';
import Icon from '@/components/Icon';
import { extractErrorMessage } from '@/lib/utils';
import { triageApi, type TriageRecommendation } from '@/lib/api/triage';
import TriageCard from '@/components/triage/TriageCard';
import PageContainer from '@/components/PageContainer';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];

export default function CaseTriagePage() {
  const [status, setStatus] = useState('');
  const [riskLevel, setRiskLevel] = useState('');
  const [year, setYear] = useState('');
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [limit, setLimit] = useState('20');
  const [recs, setRecs] = useState<TriageRecommendation[] | null>(null);
  const [running, setRunning] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scope = () => ({
    status: status || undefined,
    riskLevel: riskLevel || undefined,
    year: year ? Number(year) : undefined,
    assignedToMe,
  });

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const r = await triageApi.run({ ...scope(), limit: Number(limit) || 20 });
      setRecs(r.recommendations);
    } catch (e) {
      setError(extractErrorMessage(e));
      setRecs(null);
    } finally {
      setRunning(false);
    }
  };

  // Full coverage: keep triaging untriaged cases in chunks until the backlog is dry.
  const runAll = async () => {
    setSweeping(true);
    setError(null);
    const acc: TriageRecommendation[] = [];
    const CHUNK = 25;
    try {
      for (let i = 0; i < 400; i++) {
        const r = await triageApi.run({ ...scope(), limit: CHUNK, skipTriaged: true });
        acc.push(...r.recommendations);
        setRecs([...acc]);
        if (r.count < CHUNK) break; // last (partial) chunk → backlog is clear
      }
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setSweeping(false);
    }
  };

  const patch = (id: string, next: Partial<TriageRecommendation>) =>
    setRecs((prev) => (prev ? prev.map((r) => (r.id === id ? { ...r, ...next } : r)) : prev));

  const onApply = async (rec: TriageRecommendation) => {
    const res = await triageApi.apply(rec.id);
    patch(rec.id, { status: res.recommendation.status, appliedTo: res.recommendation.appliedTo });
  };
  const onSkip = async (rec: TriageRecommendation) => {
    await triageApi.skip(rec.id);
    patch(rec.id, { status: 'SKIPPED' });
  };

  const pending = recs?.filter((r) => r.status === 'PENDING').length ?? 0;

  return (
    <PageContainer>
      <PageHeader
        title="Case Triage"
        icon="robot"
        subtitle="IRIS reviews a caseload and recommends the next action for each case — advance to review, dismiss, request more data, or issue a §35 notice — with the rationale. You approve; the engine still computes every figure and every action is audited."
      />

      {/* Scope */}
      <div className="mb-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--elev-1)]">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Open &amp; under review</option>
            <option value="OPEN">Open only</option>
            <option value="UNDER_REVIEW">Under review only</option>
          </Select>
          <Select label="Risk level" value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)}>
            <option value="">All risk levels</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </Select>
          <Select label="Tax year" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">All years</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Select label="Batch size" value={limit} onChange={(e) => setLimit(e.target.value)}>
            {['10', '20', '30', '40'].map((n) => <option key={n} value={n}>{n} cases</option>)}
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
            <input type="checkbox" checked={assignedToMe} onChange={(e) => setAssignedToMe(e.target.checked)} className="rounded border-[var(--line)]" />
            Only cases assigned to me
          </label>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={runAll} loading={sweeping} disabled={running}>Triage all pending</Button>
            <Button onClick={run} loading={running} disabled={sweeping}>Run triage</Button>
          </div>
        </div>
        {sweeping && <p className="mt-2 text-xs text-[var(--ink-2)]">Working through the backlog… {recs?.length ?? 0} case(s) triaged so far.</p>}
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--ink-3)]">
          <Icon name="shield" width={13} height={13} /> IRIS sees figures and flags only — never taxpayer names, account numbers, or IDs.
        </p>
      </div>

      {error && <p className="mb-4 rounded-lg bg-[var(--bad-soft)] px-3 py-2 text-sm text-[var(--bad)]">{error}</p>}

      {recs === null ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] py-16 text-center text-sm text-[var(--ink-2)] shadow-[var(--elev-1)]">
          Choose a scope and run triage to get ranked recommendations.
        </div>
      ) : recs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] py-16 text-center text-sm text-[var(--ink-2)] shadow-[var(--elev-1)]">
          No cases matched that scope.
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-[var(--ink-2)]">{recs.length} recommendation{recs.length === 1 ? '' : 's'} · {pending} awaiting your decision</p>
          <div className="space-y-3">
            {recs.map((rec) => <TriageCard key={rec.id} rec={rec} onApply={onApply} onSkip={onSkip} />)}
          </div>
        </>
      )}
    </PageContainer>
  );
}
