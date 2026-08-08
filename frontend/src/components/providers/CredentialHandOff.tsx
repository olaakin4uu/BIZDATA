'use client';
import { useState } from 'react';
import Icon from '@/components/Icon';
import type { HandOffCredentials } from '@/lib/api/providers';

/**
 * The one-and-only sight of a provider's set-password link.
 *
 * Shown after creating a portal login or resetting one. No password is ever
 * issued: the provider follows this link and chooses their own, so no staff
 * member — and no one reading this screen over a shoulder — ever knows a
 * provider's secret. Only the SHA-256 of the token is stored, so the link cannot
 * be recovered afterwards; losing it is recoverable by resetting the account,
 * but the staff member should know that before navigating away.
 *
 * When SMTP is configured the message has already been emailed and this is a
 * backup; when it is not, this IS the delivery mechanism.
 */
export default function CredentialHandOff({
  credentials,
  onDone,
}: {
  credentials: HandOffCredentials;
  onDone?: () => void;
}) {
  const [copied, setCopied] = useState<'note' | 'link' | null>(null);

  const copy = async (what: 'note' | 'link', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard is blocked on insecure origins and in some locked-down
      // browsers. The values are all visible and selectable above, so a failed
      // copy degrades to selecting by hand rather than losing the credential.
      setCopied(null);
    }
  };

  return (
    <div className="rounded-xl border border-amber-300 bg-[var(--warn-soft)] p-5 mb-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 ring-1 ring-amber-200">
          <Icon name="unlock" width={16} height={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900">
            {credentials.emailed
              ? 'Access details sent by email — copy below as a backup'
              : 'Access details ready to send'}
          </p>
          <p className="mt-0.5 text-xs text-amber-800">
            {credentials.emailed
              ? 'A copy has gone to the address above.'
              : 'Email is not configured yet, so send this to the provider yourself.'}{' '}
            <strong>No password is issued</strong> — the provider sets their own via this link, so nobody
            here ever knows it. The link works <strong>once</strong> and expires on{' '}
            {new Date(credentials.expiresAt).toISOString().slice(0, 10)}; it cannot be shown again, so
            reset the account to issue a new one.
          </p>

          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[7rem_1fr]">
            <dt className="text-xs font-medium text-amber-900">Portal</dt>
            <dd className="font-mono text-xs text-slate-800 break-all">{credentials.portalUrl}</dd>
            <dt className="text-xs font-medium text-amber-900">Username</dt>
            <dd className="font-mono text-xs text-slate-800 break-all">{credentials.username}</dd>
            <dt className="text-xs font-medium text-amber-900">Set-password link</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <code className="max-w-full break-all rounded bg-white px-2 py-1 font-mono text-[11px] text-slate-900 ring-1 ring-amber-200">
                {credentials.inviteUrl}
              </code>
              <button
                type="button"
                onClick={() => copy('link', credentials.inviteUrl)}
                className="text-xs font-medium text-amber-800 underline hover:text-amber-900"
              >
                {copied === 'link' ? 'Copied' : 'Copy link'}
              </button>
            </dd>
          </dl>

          {credentials.mustChangePassword && (
            <p className="mt-2 text-[11px] text-amber-700">
              Until the link is used the account cannot be signed into at all — there is no password to guess.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => copy('note', credentials.note)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
            >
              <Icon name="document" width={13} height={13} />
              {copied === 'note' ? 'Message copied' : 'Copy message to send'}
            </button>
            {onDone && (
              <button
                type="button"
                onClick={onDone}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50"
              >
                I have sent it — dismiss
              </button>
            )}
          </div>

          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] text-amber-800">Preview the message</summary>
            <pre className="mt-1.5 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 font-mono text-[11px] leading-relaxed text-slate-700 ring-1 ring-amber-200">
              {credentials.note}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
