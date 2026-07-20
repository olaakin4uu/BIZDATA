'use client';
import { useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import SubmissionUploader from '@/components/SubmissionUploader';
import Icon from '@/components/Icon';
import { providerPortalApi } from '@/lib/api/provider-portal';
import { useProviderAuthStore } from '@/store/providerAuthStore';
import { extractErrorMessage } from '@/lib/utils';
import { APP_NAME } from '@/lib/appName';

export default function NewProviderSubmissionPage() {
  const user = useProviderAuthStore((s) => s.user);
  const freq = user?.provider?.reportingFrequency ?? 'QUARTERLY';
  const providerType = (user?.provider?.providerType ?? '').replace(/_/g, ' ').toLowerCase();
  const [dlErr, setDlErr] = useState<string | null>(null);

  const downloadTemplate = async () => {
    setDlErr(null);
    try { await providerPortalApi.downloadTemplate(); }
    catch (e) { setDlErr(extractErrorMessage(e)); }
  };

  return (
    <div className="rise-in">
      <PageHeader
        title="New submission"
        subtitle={`Upload a CSV for ${user?.providerName ?? user?.provider?.name ?? 'your organisation'}.`}
        icon="upload"
        actions={
          <Link href="/provider/submissions" className="text-sm text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]">
            ← Back to submissions
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-100 bg-[var(--surface)] px-5 py-4 shadow-[var(--elev-1)]" style={{ backgroundImage: 'var(--brand-grad-soft)' }}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-100/70 text-teal-700 ring-1 ring-teal-200">
            <Icon name="document" width={17} height={17} />
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">Need the format?</p>
            <p className="text-xs text-[var(--ink-2)]">
              Download the annotated CSV template for {providerType ? `${providerType} providers` : 'your provider type'} — it lists every column your return needs, each labelled with whether it&apos;s required and its expected format, plus a filled example row.
            </p>
            {dlErr && <p className="mt-1 text-xs text-rose-600">{dlErr}</p>}
          </div>
        </div>
        <button
          onClick={downloadTemplate}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-teal-300 bg-white/80 px-4 py-2 text-sm font-medium text-teal-700 transition-colors hover:border-teal-400 hover:bg-white"
        >
          <Icon name="download" width={15} height={15} /> Download template
        </button>
      </div>

      <SubmissionUploader
        reportingFrequency={freq}
        submissionLinkPrefix="/provider/submissions"
        description={`Your reporting frequency is set to ${freq}. Files up to 100 MB are accepted. Every row is validated against the ${providerType || APP_NAME} schema — required fields must be present and correctly formatted. The file is accepted only if every row is valid; if any row fails, the whole file is rejected and we list the rows to fix.`}
        onUpload={(payload) => providerPortalApi.upload(payload)}
      />
    </div>
  );
}
