'use client';
import { useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { taxpayersApi } from '@/lib/api/taxpayers';
import { extractErrorMessage, formatBytes } from '@/lib/utils';

export default function ImportTaxpayersPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; errors: string[] } | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await taxpayersApi.importCsv(file);
      setResult(r);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <PageHeader
        title="Import taxpayers"
        subtitle="Bulk-create or update taxpayer records from a CSV file."
        actions={<Link href="/taxpayers" className="text-sm text-slate-600 hover:text-slate-900">← Back</Link>}
      />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-4">
        <h2 className="font-semibold text-slate-800 mb-2">CSV format</h2>
        <p className="text-xs text-slate-600 mb-2">
          Header row required. Recognised columns (case-insensitive):
        </p>
        <pre className="bg-slate-50 border border-slate-200 rounded-md p-3 text-[11px] font-mono text-slate-700 overflow-x-auto">
nin,cacrcnumber,tin,type,firstname,lastname,businessname,phone,email,stateofresidence
</pre>
        <p className="text-xs text-slate-500 mt-2">
          <code>type</code> = INDIVIDUAL | CORPORATE | GOVERNMENT. At least one of <code>nin</code> or <code>cacrcnumber</code> required.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <label htmlFor="csv" className="block cursor-pointer border-2 border-dashed border-slate-300 hover:border-teal-400 rounded-xl p-6 text-center">
          <p className="text-3xl mb-2">📊</p>
          {file ? (
            <p className="text-sm font-medium text-slate-800">{file.name} ({formatBytes(file.size)})</p>
          ) : (
            <p className="text-sm text-slate-500">Click to choose a CSV file (max 100 MB)</p>
          )}
          <input id="csv" type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); setError(null); }} />
        </label>

        {error && (
          <div className="mt-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || busy}
          className="mt-4 px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
        >
          {busy ? 'Importing…' : 'Upload & import'}
        </button>
      </div>

      {result && (
        <div className="mt-5 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 text-sm">
          <p className="font-semibold text-emerald-800">
            Import complete — {result.created} created, {result.updated} updated, {result.skipped} skipped.
          </p>
          {result.errors.length > 0 && (
            <div className="mt-3 bg-white/60 border border-emerald-100 rounded-lg p-3 text-xs">
              <p className="font-medium text-red-700 mb-1">Errors ({result.errors.length}):</p>
              <ul className="space-y-0.5 list-disc list-inside text-red-700">
                {result.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
                {result.errors.length > 20 && <li>…and {result.errors.length - 20} more</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
