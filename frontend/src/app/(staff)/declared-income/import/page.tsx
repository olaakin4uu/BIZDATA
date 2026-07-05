'use client';
import { useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { declaredIncomeApi, type ImportResult } from '@/lib/api/declared-income';
import { extractErrorMessage, formatBytes } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200/api';

type Phase = 'choose' | 'previewed' | 'done';

export default function ImportDeclaredIncomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showAllErrors, setShowAllErrors] = useState(false);

  const reset = (f: File | null) => {
    setFile(f); setPhase('choose'); setError(null);
    setPreview(null); setResult(null); setShowAllErrors(false);
  };

  const handleValidate = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const r = await declaredIncomeApi.validateCsv(file);
      setPreview(r); setPhase('previewed');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally { setBusy(false); }
  };

  const handleCommit = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const r = await declaredIncomeApi.importCsv(file);
      setResult(r); setPhase('done');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally { setBusy(false); }
  };

  const downloadTemplate = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('bizdata_staff_token') : null;
      const res = await fetch(`${API_BASE}/declared-income/template`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Could not fetch template');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'declared-income-template.csv';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <PageHeader
        title="Import declared income"
        subtitle="Bulk-upload declarations to compare against ingested provider data. Validate first, then commit."
        actions={<Link href="/declared-income" className="text-sm text-slate-600 hover:text-slate-900">← Back</Link>}
      />

      {/* Format reference + template */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-semibold text-slate-800 mb-2">CSV format</h2>
            <pre className="bg-slate-50 border border-slate-200 rounded-md p-3 text-[11px] font-mono text-slate-700 overflow-x-auto">taxpayernin,taxpayercacrcnumber,year,assessableincome,source,notes</pre>
          </div>
          <button onClick={downloadTemplate} className="shrink-0 text-sm font-medium text-teal-700 hover:text-teal-800 border border-teal-200 hover:border-teal-300 rounded-lg px-3 py-2">
            ↓ Sample template
          </button>
        </div>
        <ul className="text-xs text-slate-500 mt-3 space-y-1 list-disc list-inside">
          <li><code>year</code> and <code>assessableincome</code> are required; at least one of <code>taxpayernin</code> / <code>taxpayercacrcnumber</code> must match an existing taxpayer.</li>
          <li>Fields with commas (e.g. amounts or notes) may be wrapped in double quotes: <code>&quot;1,250,000.75&quot;</code>.</li>
          <li>Re-importing the same taxpayer + year <strong>updates</strong> the existing declaration.</li>
        </ul>
      </div>

      {/* File chooser */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <label htmlFor="csv" className="block cursor-pointer border-2 border-dashed border-slate-300 hover:border-teal-400 rounded-xl p-6 text-center">
          <p className="text-3xl mb-2">📊</p>
          {file ? (
            <p className="text-sm font-medium text-slate-800">{file.name} <span className="text-slate-400">({formatBytes(file.size)})</span></p>
          ) : (
            <p className="text-sm text-slate-500">Click to choose a CSV file (max 100 MB)</p>
          )}
          <input id="csv" type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => reset(e.target.files?.[0] ?? null)} />
        </label>

        {error && (
          <div className="mt-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        <div className="mt-4 flex items-center gap-3">
          {phase !== 'done' && (
            <button
              onClick={handleValidate}
              disabled={!file || busy}
              className="px-5 py-2 border border-slate-300 hover:border-slate-400 text-slate-700 text-sm font-semibold rounded-lg disabled:opacity-50"
            >
              {busy && phase === 'choose' ? 'Validating…' : phase === 'previewed' ? 'Re-validate' : 'Validate (dry run)'}
            </button>
          )}
          {phase === 'previewed' && preview && (
            <button
              onClick={handleCommit}
              disabled={busy || (preview.created + preview.updated === 0)}
              className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
              title={preview.created + preview.updated === 0 ? 'Nothing valid to import' : undefined}
            >
              {busy ? 'Importing…' : `Commit import (${preview.created + preview.updated} rows)`}
            </button>
          )}
        </div>
      </div>

      {/* Preview (dry run) */}
      {phase === 'previewed' && preview && (
        <ResultCard result={preview} showAllErrors={showAllErrors} onToggleErrors={() => setShowAllErrors((s) => !s)} />
      )}

      {/* Committed result */}
      {phase === 'done' && result && (
        <ResultCard result={result} showAllErrors={showAllErrors} onToggleErrors={() => setShowAllErrors((s) => !s)} />
      )}
    </div>
  );
}

function ResultCard({ result, showAllErrors, onToggleErrors }: { result: ImportResult; showAllErrors: boolean; onToggleErrors: () => void }) {
  const committed = !result.dryRun;
  const nothingToDo = result.created + result.updated === 0;
  const tone = committed
    ? 'bg-emerald-50 border-emerald-200'
    : nothingToDo ? 'bg-amber-50 border-amber-200' : 'bg-sky-50 border-sky-200';
  const errorsToShow = showAllErrors ? result.errors : result.errors.slice(0, 15);

  return (
    <div className={`mt-5 border rounded-xl px-5 py-4 text-sm ${tone}`}>
      <p className="font-semibold text-slate-800">
        {committed ? '✓ Import complete' : nothingToDo ? 'Nothing to import' : 'Preview (dry run — nothing written yet)'}
      </p>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Rows" value={result.totalRows} />
        <Stat label="Created" value={result.created} tone="emerald" />
        <Stat label="Updated" value={result.updated} tone="sky" />
        <Stat label="Skipped" value={result.skipped} tone={result.skipped > 0 ? 'amber' : 'default'} />
      </div>

      {result.warnings.length > 0 && (
        <div className="mt-3 text-xs text-amber-700">
          {result.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
        </div>
      )}

      {result.errors.length > 0 && (
        <div className="mt-3 bg-white/70 border border-slate-200 rounded-lg p-3 text-xs">
          <p className="font-medium text-red-700 mb-1">
            {result.errorCount} row{result.errorCount === 1 ? '' : 's'} with problems{committed ? ' (skipped)' : ''}:
          </p>
          <ul className="space-y-0.5 list-disc list-inside text-red-700 max-h-64 overflow-y-auto">
            {errorsToShow.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
          {result.errors.length > 15 && (
            <button onClick={onToggleErrors} className="mt-2 text-slate-500 hover:text-slate-700 underline">
              {showAllErrors ? 'Show fewer' : `Show all ${result.errors.length}`}
            </button>
          )}
          {result.errorCount > result.errors.length && (
            <p className="mt-1 text-slate-400">…and {result.errorCount - result.errors.length} more not listed.</p>
          )}
        </div>
      )}

      {!committed && !nothingToDo && (
        <p className="mt-3 text-xs text-slate-500">Review the numbers above, then click <strong>Commit import</strong> to write these declarations.</p>
      )}
    </div>
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'emerald' | 'sky' | 'amber' }) {
  const color = { default: 'text-slate-800', emerald: 'text-emerald-700', sky: 'text-sky-700', amber: 'text-amber-700' }[tone];
  return (
    <div className="bg-white/70 border border-slate-200 rounded-lg px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${color}`}>{value.toLocaleString()}</p>
    </div>
  );
}
