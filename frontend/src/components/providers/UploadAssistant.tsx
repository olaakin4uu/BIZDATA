'use client';
import { useMemo, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { Button } from '@/components/Button';
import { extractErrorMessage } from '@/lib/utils';
import { providerPortalApi, type ImportPreview } from '@/lib/api/provider-portal';

interface PeriodOption {
  label: string;
  year: number;
  quarter?: number;
  month?: number;
  display: string;
}

function endedPeriods(freq: string): PeriodOption[] {
  const now = new Date();
  const y = now.getUTCFullYear();
  const f = (freq || 'QUARTERLY').toUpperCase();
  const out: PeriodOption[] = [];
  if (f === 'MONTHLY') {
    for (let i = 1; i <= 12; i++) {
      const d = new Date(Date.UTC(y, now.getUTCMonth() - i, 1));
      const yy = d.getUTCFullYear();
      const mm = d.getUTCMonth() + 1;
      out.push({ label: `${yy}-${String(mm).padStart(2, '0')}`, year: yy, month: mm, display: `${d.toLocaleString('en', { month: 'long', timeZone: 'UTC' })} ${yy}` });
    }
  } else if (f === 'ANNUAL' || f === 'ANNUALLY' || f === 'YEARLY') {
    for (let i = 1; i <= 3; i++) out.push({ label: `${y - i}`, year: y - i, display: `${y - i}` });
  } else {
    let qy = y;
    let q = Math.floor(now.getUTCMonth() / 3) + 1;
    for (let i = 0; i < 6; i++) {
      q--;
      if (q < 1) { q = 4; qy--; }
      out.push({ label: `${qy}-Q${q}`, year: qy, quarter: q, display: `Q${q} ${qy}` });
    }
  }
  return out;
}

/**
 * IRIS Upload Assistant — interactive. Analyze a messy CSV, review + edit the
 * proposed column mapping, re-check live, then approve. Approval goes through the
 * normal upload pipeline, so every ingestion rule still applies.
 */
export default function UploadAssistant({
  reportingFrequency,
  onSubmitted,
}: {
  reportingFrequency: string;
  onSubmitted: (submissionId: string) => void;
}) {
  const periods = useMemo(() => endedPeriods(reportingFrequency), [reportingFrequency]);
  const [period, setPeriod] = useState<PeriodOption | null>(periods[0] ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<{ source: string; target: string }[]>([]);
  const [busy, setBusy] = useState<null | 'analyze' | 'recheck' | 'approve'>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // CSV or Excel (.xlsx). The picker's accept filter is bypassed by drag-and-drop,
  // so check here before the provider waits on an upload that cannot succeed.
  const pickFile = (f: File | null) => {
    setError(null);
    if (!f) return setFile(null);
    const ext = f.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
    if (ext && ext !== 'csv' && ext !== 'txt' && ext !== 'xlsx') {
      setFile(null);
      return setError(
        `I can read CSV or Excel (.xlsx) files — this is a .${ext} file. In your spreadsheet program choose File → Save As and ` +
        `set the type to CSV ("CSV (Comma delimited)" in Excel, "Text CSV" in LibreOffice), then upload the .csv file.`,
      );
    }
    const max = ext === 'xlsx' ? 15 : 50;
    if (f.size > max * 1024 * 1024) {
      setFile(null);
      return setError(
        `That file is ${(f.size / 1024 / 1024).toFixed(1)} MB; ${ext === 'xlsx' ? 'Excel' : 'CSV'} files can be up to ${max} MB here.` +
        (ext === 'xlsx' ? ' Save it as CSV and try again, or use Classic upload.' : ' Use Classic upload for larger files.'),
      );
    }
    setFile(f);
  };

  const reset = () => {
    setPreview(null);
    setMapping([]);
    setError(null);
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const analyze = async () => {
    if (!file || !period) return;
    setBusy('analyze');
    setError(null);
    try {
      const p = await providerPortalApi.analyzeImport({ file, periodLabel: period.label, periodYear: period.year, periodQuarter: period.quarter, periodMonth: period.month });
      setPreview(p);
      setMapping(p.mapping.map((m) => ({ source: m.source, target: m.target })));
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const recheck = async () => {
    if (!preview) return;
    setBusy('recheck');
    setError(null);
    try {
      const p = await providerPortalApi.revalidateImport(preview.draftId, mapping);
      setPreview(p);
      setMapping(p.mapping.map((m) => ({ source: m.source, target: m.target })));
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    if (!preview) return;
    setBusy('approve');
    setError(null);
    try {
      const sub = await providerPortalApi.approveImport(preview.draftId);
      onSubmitted((sub as { id: string }).id);
    } catch (e) {
      setError(extractErrorMessage(e));
      setBusy(null);
    }
  };

  const setTarget = (source: string, target: string) =>
    setMapping((prev) => prev.map((m) => (m.source === source ? { ...m, target } : m)));

  /* ── Step 1: pick period + file ─────────────────────────────────────────── */
  if (!preview) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--elev-1)]">
        <AssistantHeader />
        <p className="mt-2 text-sm text-[var(--ink-2)]">
          Drop your file below — even if the headings are wrong, mixed up, or out of order. I’ll read it, map the columns to the
          correct fields, show you a preview, and only submit once you approve.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Reporting period</span>
            <select
              value={period?.label ?? ''}
              onChange={(e) => setPeriod(periods.find((p) => p.label === e.target.value) ?? null)}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] focus:border-teal-500"
            >
              {periods.map((p) => (
                <option key={p.label} value={p.label}>{p.display}</option>
              ))}
            </select>
          </label>

        </div>

        <label
          htmlFor="assistant-file"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0] ?? null); }}
          className={`mt-4 block cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            dragOver ? 'border-teal-500 bg-teal-50' : 'border-[var(--line)] hover:border-teal-400 hover:bg-[var(--surface-2)]'
          }`}
        >
          <span className={`mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full ring-1 transition-colors ${dragOver ? 'bg-teal-100 text-teal-700 ring-teal-200' : 'bg-teal-50 text-teal-700 ring-teal-100'}`}>
            <Icon name="upload" width={20} height={20} />
          </span>
          {file ? (
            <p className="text-sm font-medium text-[var(--ink)]">
              {file.name} <span className="font-normal text-[var(--ink-3)]">({(file.size / 1024 / 1024).toFixed(1)} MB) — click to choose another</span>
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-[var(--ink)]">Drag a CSV or Excel file here</p>
              <p className="text-xs text-[var(--ink-3)]">or click to browse — CSV up to 50 MB, Excel (.xlsx) up to 15 MB; for Excel the first sheet with data is read</p>
            </>
          )}
          <input
            ref={fileRef}
            id="assistant-file"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
        </label>

        {error && <p className="mt-3 rounded-lg bg-[var(--bad-soft)] px-3 py-2 text-sm text-[var(--bad)]">{error}</p>}

        <div className="mt-4 flex justify-end">
          <Button onClick={analyze} loading={busy === 'analyze'} disabled={!file || !period}>
            Analyze with IRIS
          </Button>
        </div>
      </div>
    );
  }

  /* ── Step 2: review + edit mapping ──────────────────────────────────────── */
  const { stats } = preview;
  const ready = stats.reject === 0 && stats.total > 0;
  const mappedTargets = mapping.filter((m) => m.target);
  const afterCols = preview.canonicalFields.map((f) => f.name).filter((n) => mappedTargets.some((m) => m.target === n));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--elev-1)]">
        <AssistantHeader />
        <p className="mt-2 text-sm text-[var(--ink-2)]">
          I read <span className="font-medium text-[var(--ink)]">{preview.fileName || 'your file'}</span> ({stats.total.toLocaleString()} rows).{' '}
          {preview.aiUsed ? 'I mapped your columns to the correct fields.' : 'AI is offline, so I matched columns using built-in rules.'}{' '}
          Review the mapping below — you can change any of it, then re-check.
        </p>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-[var(--ok-soft)] px-2.5 py-1 font-semibold text-[var(--ok)]">{stats.accept.toLocaleString()} rows ready</span>
          {stats.reject > 0 && <span className="rounded-full bg-[var(--bad-soft)] px-2.5 py-1 font-semibold text-[var(--bad)]">{stats.reject.toLocaleString()} need attention</span>}
          <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 font-medium text-[var(--ink-2)]">{stats.total.toLocaleString()} total</span>
        </div>

        <details className="mt-3 text-xs text-[var(--ink-2)]">
          <summary className="cursor-pointer font-medium text-[var(--ink-2)] hover:text-[var(--ink)]">The rules I follow</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {preview.rules.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </details>
      </div>

      {/* Mapping editor */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--elev-1)]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--ink)]">Column mapping</h3>
          <Button variant="secondary" size="sm" onClick={recheck} loading={busy === 'recheck'}>Re-check</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-xs uppercase tracking-wide text-[var(--ink-3)]">
                <th className="py-2 pr-4 font-semibold">Your column</th>
                <th className="py-2 font-semibold">Maps to</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line-2)]">
              {mapping.map((m) => (
                <tr key={m.source}>
                  <td className="py-2 pr-4 font-mono text-xs text-[var(--ink)]">{m.source}</td>
                  <td className="py-2">
                    <select
                      value={m.target}
                      onChange={(e) => setTarget(m.source, e.target.value)}
                      className={`rounded-lg border px-2.5 py-1.5 text-sm ${m.target ? 'border-[var(--line)] text-[var(--ink)]' : 'border-dashed border-[var(--line)] text-[var(--ink-3)]'} bg-[var(--surface)] focus:border-teal-500`}
                    >
                      <option value="">— Ignore this column —</option>
                      {preview.canonicalFields.map((f) => (
                        <option key={f.name} value={f.name}>{f.name}{f.required ? ' *' : ''}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-[var(--ink-3)]">Fields marked * are required. Change any mapping and press Re-check to see the effect.</p>
      </div>

      {/* Cleaned preview */}
      {afterCols.length > 0 && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--elev-1)]">
          <h3 className="mb-3 text-sm font-semibold text-[var(--ink)]">Cleaned preview <span className="font-normal text-[var(--ink-3)]">(first {preview.sample.length} rows)</span></h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--line)] text-left uppercase tracking-wide text-[var(--ink-3)]">
                  {afterCols.map((c) => <th key={c} className="whitespace-nowrap px-2 py-1.5 font-semibold">{c}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line-2)]">
                {preview.sample.map((r, i) => (
                  <tr key={i}>
                    {afterCols.map((c) => <td key={c} className="whitespace-nowrap px-2 py-1.5 text-[var(--ink-2)]">{r.after[c] || <span className="text-[var(--ink-3)]">—</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Issues */}
      {preview.issues.length > 0 && (
        <div className="rounded-2xl border border-[var(--bad)]/30 bg-[var(--surface)] p-5 shadow-[var(--elev-1)]">
          <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">Rows I couldn’t auto-fix</h3>
          <p className="mb-3 text-xs text-[var(--ink-2)]">These need a value I won’t invent (e.g. a missing NIN) — fix them in your file, or adjust the mapping, then Re-check.</p>
          <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
            {preview.issues.map((iss) => (
              <li key={iss.row} className="flex gap-2">
                <span className="tnum shrink-0 font-semibold text-[var(--ink-3)]">Row {iss.row}</span>
                <span className="text-[var(--bad)]">{iss.errors.join('; ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="rounded-lg bg-[var(--bad-soft)] px-3 py-2 text-sm text-[var(--bad)]">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={reset}>Start over</Button>
        <div className="flex items-center gap-3">
          {!ready && <span className="text-xs text-[var(--ink-2)]">Fix the {stats.reject.toLocaleString()} flagged row(s) to enable submit.</span>}
          <Button onClick={approve} loading={busy === 'approve'} disabled={!ready}>Approve &amp; submit</Button>
        </div>
      </div>
    </div>
  );
}

function AssistantHeader() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-600 text-white">
        <Icon name="robot" width={18} height={18} />
      </span>
      <div>
        <p className="text-sm font-semibold text-[var(--ink)]">IRIS Upload Assistant</p>
        <p className="text-[11px] text-[var(--ink-3)]">Fixes messy headings &amp; formatting · you approve before anything is submitted</p>
      </div>
    </div>
  );
}
