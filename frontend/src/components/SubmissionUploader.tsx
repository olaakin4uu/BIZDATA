'use client';
import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { formatBytes, extractErrorMessage } from '@/lib/utils';
import type { Submission } from '@/lib/api/submissions';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);
const QUARTERS = [1, 2, 3, 4];
const MONTHS = [
  { num: 1, label: 'Jan' }, { num: 2, label: 'Feb' }, { num: 3, label: 'Mar' },
  { num: 4, label: 'Apr' }, { num: 5, label: 'May' }, { num: 6, label: 'Jun' },
  { num: 7, label: 'Jul' }, { num: 8, label: 'Aug' }, { num: 9, label: 'Sep' },
  { num: 10, label: 'Oct' }, { num: 11, label: 'Nov' }, { num: 12, label: 'Dec' },
];

const MAX_SIZE_BYTES = 100 * 1024 * 1024;

export interface UploadPayload {
  periodLabel: string;
  periodYear: number;
  periodQuarter?: number;
  periodMonth?: number;
  file: File;
}

interface SubmissionUploaderProps {
  reportingFrequency?: string | null; // QUARTERLY | MONTHLY | ANNUAL
  onUpload: (payload: UploadPayload) => Promise<Submission>;
  submissionLinkPrefix?: string; // e.g. '/submissions' or '/provider/submissions'
  description?: React.ReactNode;
}

export default function SubmissionUploader({
  reportingFrequency = 'QUARTERLY',
  onUpload,
  submissionLinkPrefix = '/submissions',
  description,
}: SubmissionUploaderProps) {
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [quarter, setQuarter] = useState<number>(1);
  const [month, setMonth] = useState<number>(1);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Submission | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const freq = (reportingFrequency || 'QUARTERLY').toUpperCase();

  const periodLabel = useMemo(() => {
    if (freq === 'MONTHLY') return `${year}-${String(month).padStart(2, '0')}`;
    if (freq === 'ANNUAL') return `${year}`;
    return `${year}-Q${quarter}`;
  }, [freq, year, quarter, month]);

  const handleFile = (f: File | null) => {
    setError(null);
    setResult(null);
    if (!f) return setFile(null);
    if (f.size > MAX_SIZE_BYTES) {
      setError(`File too large (${formatBytes(f.size)}). Max 100 MB.`);
      return;
    }
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setError('Please pick a file first'); return; }
    setBusy(true); setError(null); setResult(null);
    try {
      const payload: UploadPayload = {
        periodLabel,
        periodYear: year,
        periodQuarter: freq === 'QUARTERLY' ? quarter : undefined,
        periodMonth: freq === 'MONTHLY' ? month : undefined,
        file,
      };
      const sub = await onUpload(payload);
      setResult(sub);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const validationIssues = result?.validationErrors as Record<string, unknown> | undefined;

  const selectCls = 'w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm transition-colors focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50';

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--elev-1)]">
      <h2 className="font-semibold text-[var(--ink)] mb-1">Upload submission file</h2>
      {description && <p className="text-xs text-[var(--ink-2)] mb-4">{description}</p>}

      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--ink-2)] mb-1">Year</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectCls}>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {freq === 'QUARTERLY' && (
            <div>
              <label className="block text-xs font-medium text-[var(--ink-2)] mb-1">Quarter</label>
              <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} className={selectCls}>
                {QUARTERS.map((q) => <option key={q} value={q}>Q{q}</option>)}
              </select>
            </div>
          )}
          {freq === 'MONTHLY' && (
            <div>
              <label className="block text-xs font-medium text-[var(--ink-2)] mb-1">Month</label>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={selectCls}>
                {MONTHS.map((m) => <option key={m.num} value={m.num}>{m.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-[var(--ink-2)] mb-1">Period label</label>
            <input
              readOnly
              value={periodLabel}
              className="tnum w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="submission-file"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`block cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              dragOver ? 'border-teal-500 bg-teal-50' : 'border-[var(--line)] hover:border-teal-400 hover:bg-[var(--surface-2)]'
            }`}
          >
            <span className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full ring-1 transition-colors ${dragOver ? 'bg-teal-100 text-teal-700 ring-teal-200' : 'bg-teal-50 text-teal-700 ring-teal-100'}`}>
              <Icon name="upload" width={22} height={22} />
            </span>
            {file ? (
              <p className="text-sm font-medium text-[var(--ink)]">
                {file.name} <span className="tnum font-normal text-[var(--ink-3)]">({formatBytes(file.size)})</span>
              </p>
            ) : (
              <>
                <p className="text-sm font-medium text-[var(--ink)]">Drag a CSV file here</p>
                <p className="text-xs text-[var(--ink-3)]">or click to browse — max 100 MB</p>
              </>
            )}
            <input
              ref={fileRef}
              id="submission-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-[var(--bad-soft)] px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !file}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
          style={{ backgroundImage: 'var(--brand-grad)', boxShadow: 'var(--elev-brand)' }}
        >
          {busy ? 'Uploading…' : 'Upload submission'}
        </button>
      </form>

      {result && (() => {
        // Status-aware result box: rejected files must NOT read as success.
        const rejected = result.status === 'REJECTED';
        const partial = result.status === 'PARTIALLY_ACCEPTED';
        const warned = !rejected && !partial && (result.warningCount ?? 0) > 0;
        const tone = rejected
          ? { box: 'border-rose-200 bg-[var(--bad-soft)]', head: 'text-rose-800', body: 'text-rose-700', icon: 'flag' as const, pre: 'border-rose-100' }
          : (partial || warned)
            ? { box: 'border-amber-200 bg-[var(--warn-soft)]', head: 'text-amber-800', body: 'text-amber-700', icon: 'flag' as const, pre: 'border-amber-100' }
            : { box: 'border-emerald-200 bg-[var(--ok-soft)]', head: 'text-emerald-800', body: 'text-emerald-700', icon: 'shield' as const, pre: 'border-emerald-100' };
        const title = rejected ? 'File rejected — no records were saved'
          : partial ? 'Partially accepted — some rows were rejected'
          : warned ? 'Accepted — but some fields will be required in future'
          : 'Submission received';
        return (
        <div className={`mt-5 rounded-xl border px-4 py-4 text-sm ${tone.box}`}>
          <p className={`flex items-center gap-2 font-semibold ${tone.head}`}>
            <Icon name={tone.icon} width={16} height={16} /> {title}
          </p>
          <p className={`tnum mt-1 text-xs ${tone.body}`}>
            Status: <span className="font-mono">{result.status}</span> · {result.acceptedCount} accepted ·{' '}
            {result.rejectedCount} rejected{(result.warningCount ?? 0) > 0 ? ` · ${result.warningCount} with warnings` : ''} · {result.recordCount} total
          </p>
          {warned && (
            <p className={`mt-1 text-xs ${tone.body}`}>
              Some rows are missing fields that become mandatory soon. They were accepted now, but populate them to avoid rejected files later. See the submission detail for the list.
            </p>
          )}
          {rejected && (
            <p className={`mt-1 text-xs ${tone.body}`}>
              Every row must be valid for the file to be accepted. Fix the rows listed below and re-upload.
            </p>
          )}
          {!rejected && (
            <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50/70 px-3 py-2.5">
              <p className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                <Icon name="shield" width={14} height={14} /> 🔒 Encrypted & secured
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-emerald-700">
                Your data was transmitted over TLS and every sensitive field (BVN, NIN, account numbers) is encrypted
                at rest with AES-256 and stored under strict access controls. A tamper-evident receipt has been issued
                as your proof of filing{result.receiptHash ? <> — <span className="font-mono">{String(result.receiptHash).slice(0, 16)}…</span></> : null}.
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
                ⏱ You can review this submission for <b>1 hour</b>; after that the records are sealed (your receipt stays as proof).
                &nbsp;📌 Data may be submitted <b>once per reporting period</b> — a resubmission requires authorisation from the Tax Authority (KIRS).
              </p>
            </div>
          )}
          <Link
            href={`${submissionLinkPrefix}/${result.id}`}
            className={`mt-3 inline-block text-xs font-medium underline ${tone.head}`}
          >
            View submission detail →
          </Link>
          {validationIssues && (
            <pre className={`mt-3 max-h-48 overflow-auto rounded border bg-white/60 p-2 font-mono text-[10px] text-[var(--ink-2)] ${tone.pre}`}>
              {JSON.stringify(validationIssues, null, 2)}
            </pre>
          )}
        </div>
        );
      })()}
    </div>
  );
}
