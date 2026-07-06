'use client';
import { useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import SubmissionUploader from '@/components/SubmissionUploader';
import { providerPortalApi } from '@/lib/api/provider-portal';
import { useProviderAuthStore } from '@/store/providerAuthStore';
import { extractErrorMessage } from '@/lib/utils';

export default function NewProviderSubmissionPage() {
  const user = useProviderAuthStore((s) => s.user);
  const freq = user?.provider?.reportingFrequency ?? 'QUARTERLY';
  const providerType = (user?.provider?.providerType ?? '').replace('_', ' ').toLowerCase();
  const [dlErr, setDlErr] = useState<string | null>(null);

  const downloadTemplate = async () => {
    setDlErr(null);
    try { await providerPortalApi.downloadTemplate(); }
    catch (e) { setDlErr(extractErrorMessage(e)); }
  };

  return (
    <div>
      <PageHeader
        title="New submission"
        subtitle={`Upload a CSV for ${user?.providerName ?? user?.provider?.name ?? 'your organisation'}.`}
        actions={
          <Link href="/provider/submissions" className="text-sm text-slate-600 hover:text-slate-900">
            ← Back to submissions
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div>
          <p className="text-sm font-medium text-slate-800">Need the format?</p>
          <p className="text-xs text-slate-500">
            Download the CSV template for {providerType ? `${providerType} providers` : 'your provider type'} — the exact columns your return must contain, with an example row.
          </p>
          {dlErr && <p className="mt-1 text-xs text-rose-600">{dlErr}</p>}
        </div>
        <button
          onClick={downloadTemplate}
          className="shrink-0 rounded-lg border border-teal-200 px-4 py-2 text-sm font-medium text-teal-700 hover:border-teal-300 hover:bg-teal-50"
        >
          ↓ Download template
        </button>
      </div>

      <SubmissionUploader
        reportingFrequency={freq}
        submissionLinkPrefix="/provider/submissions"
        description={`Your reporting frequency is set to ${freq}. Files up to 100 MB are accepted. Records are validated against the BizData schema for your provider type.`}
        onUpload={(payload) => providerPortalApi.upload(payload)}
      />
    </div>
  );
}
