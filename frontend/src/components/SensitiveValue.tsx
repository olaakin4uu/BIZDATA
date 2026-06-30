'use client';
import { useStaffAuthStore } from '@/store/staffAuthStore';

/**
 * Renders a sensitive PII value (BVN, account number, NIN) with anti-exfiltration
 * affordances per §5.3: copy/paste/selection is blocked and the value is
 * watermarked on display with the viewing officer's identity and timestamp.
 *
 * Note: the authoritative protection is server-side masking — the API only
 * returns the clear value to an authorised viewer. This component deters casual
 * exfiltration of whatever clear value the officer is entitled to see.
 */
export default function SensitiveValue({ value }: { value?: string | null }) {
  const user = useStaffAuthStore((s) => s.user);
  if (value == null || value === '') return <span className="text-slate-400">—</span>;

  // Masked values (contain the bullet char) are already de-identified — show plainly.
  const isMasked = value.includes('•');
  if (isMasked) {
    return <span className="font-mono text-slate-500" title="Masked — request elevated access to reveal">{value}</span>;
  }

  const watermark = `${user?.email ?? 'officer'} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
  const block = (e: React.SyntheticEvent) => e.preventDefault();

  return (
    <span
      className="relative inline-block font-mono text-slate-800 select-none"
      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
      onCopy={block}
      onCut={block}
      onContextMenu={block}
      title={`Confidential · viewed by ${watermark}`}
      data-watermark={watermark}
    >
      {value}
      <span className="ml-1 align-super text-[8px] uppercase tracking-wide text-amber-600" aria-hidden>
        ●conf
      </span>
    </span>
  );
}
