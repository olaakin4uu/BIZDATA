'use client';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import SubmissionUploader from '@/components/SubmissionUploader';
import { providerPortalApi } from '@/lib/api/provider-portal';
import { useProviderAuthStore } from '@/store/providerAuthStore';

export default function NewProviderSubmissionPage() {
  const user = useProviderAuthStore((s) => s.user);
  const freq = user?.provider?.reportingFrequency ?? 'QUARTERLY';

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

      <SubmissionUploader
        reportingFrequency={freq}
        submissionLinkPrefix="/provider/submissions"
        description={`Your reporting frequency is set to ${freq}. Files up to 100 MB are accepted. Records are validated against the BizData schema for your provider type.`}
        onUpload={(payload) => providerPortalApi.upload(payload)}
      />
    </div>
  );
}
