'use client';
import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
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
  const [year, setYear] = useState<number>(CURRENT_YEAR - 1);
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

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h2 className="font-semibold text-slate-800 mb-1">Upload submission file</h2>
      {description && <p className="text-xs text-slate-500 mb-4">{description}</p>}

      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {freq === 'QUARTERLY' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Quarter</label>
              <select
                value={quarter}
                onChange={(e) => setQuarter(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {QUARTERS.map((q) => <option key={q} value={q}>Q{q}</option>)}
              </select>
            </div>
          )}
          {freq === 'MONTHLY' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Month</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {MONTHS.map((m) => <option key={m.num} value={m.num}>{m.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Period label</label>
            <input
              readOnly
              value={periodLabel}
              className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm font-mono text-slate-700"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="submission-file"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`block cursor-pointer border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
              dragOver ? 'border-teal-500 bg-teal-50' : 'border-slate-300 hover:border-teal-400'
            }`}
          >
            <p className="text-3xl mb-2">📂</p>
            {file ? (
              <p className="text-sm font-medium text-slate-800">
                {file.name} <span className="text-slate-400 font-normal">({formatBytes(file.size)})</span>
              </p>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-700">Drag a CSV file here</p>
                <p className="text-xs text-slate-400">or click to browse — max 100 MB</p>
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
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !file}
          className="px-4 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? 'Uploading…' : 'Upload submission'}
        </button>
      </form>

      {result && (
        <div className="mt-5 px-4 py-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm">
          <p className="font-semibold text-emerald-800">Submission received</p>
          <p className="text-xs text-emerald-700 mt-1">
            Status: <span className="font-mono">{result.status}</span> · {result.acceptedCount} accepted ·{' '}
            {result.rejectedCount} rejected · {result.recordCount} total
          </p>
          <Link
            href={`${submissionLinkPrefix}/${result.id}`}
            className="inline-block mt-3 text-xs font-medium text-emerald-700 hover:text-emerald-900 underline"
          >
            View submission detail →
          </Link>
          {validationIssues && (
            <pre className="mt-3 max-h-48 overflow-auto bg-white/60 border border-emerald-100 rounded p-2 text-[10px] font-mono text-slate-700">
              {JSON.stringify(validationIssues, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
