'use client';
import { useMemo } from 'react';
import { useStaffAuthStore } from '@/store/staffAuthStore';

/**
 * Renders a sensitive PII value (BVN, account number, NIN) with confidentiality
 * affordances per §5.3.
 *
 * IMPORTANT — what this does and does NOT do. The *authoritative* protection is
 * server-side masking: the API only returns a clear value to an authorised
 * viewer. This component is a **visual confidentiality cue and casual-exfiltration
 * deterrent** for whatever clear value the officer is entitled to see. It renders
 * a real, screenshot-surviving diagonal watermark of the viewer's identity +
 * timestamp behind the value, and deters (does not prevent) copy/select. It is
 * NOT a hard control — a determined user can still read the DOM. Do not rely on
 * it as an access boundary.
 */
export default function SensitiveValue({ value }: { value?: string | null }) {
  const user = useStaffAuthStore((s) => s.user);

  const watermark = useMemo(() => {
    const who = user?.email ?? 'officer';
    const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
    return `${who} · ${when}`;
  }, [user?.email]);

  // A genuine rendered watermark (SVG data-URI tiled as a background) so the
  // officer identity survives a screenshot / screen-capture — unlike a hover
  // title, which does not render pixels.
  const watermarkBg = useMemo(() => {
    const esc = watermark.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='230' height='46'>` +
      `<text x='4' y='30' font-family='monospace' font-size='9' fill='rgba(120,132,155,0.30)' ` +
      `transform='rotate(-18 4 30)'>${esc}</text></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }, [watermark]);

  if (value == null || value === '') return <span className="text-[var(--ink-3)]">—</span>;

  // Masked values (contain the bullet char) are already de-identified — show plainly.
  const isMasked = value.includes('•');
  if (isMasked) {
    return (
      <span className="font-mono text-[var(--ink-3)]" title="Masked — request elevated access to reveal">
        {value}
      </span>
    );
  }

  const block = (e: React.SyntheticEvent) => e.preventDefault();

  return (
    <span
      className="relative inline-flex select-none items-center gap-1 rounded px-1 font-mono text-[var(--ink)]"
      style={{
        WebkitUserSelect: 'none',
        userSelect: 'none',
        backgroundImage: watermarkBg,
        backgroundRepeat: 'repeat',
      }}
      onCopy={block}
      onCut={block}
      onContextMenu={block}
      title={`Confidential · viewed by ${watermark}`}
    >
      <span className="sr-only">Confidential personal data — </span>
      {value}
      <span className="rounded-sm bg-[var(--bad-soft)] px-1 text-[10px] font-semibold uppercase leading-tight tracking-wide text-[var(--bad)]">
        conf
      </span>
    </span>
  );
}
