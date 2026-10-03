'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

// Staff screens that open individual-level records (provider submissions, data
// records, taxpayers, cases). Matched as path prefixes.
export const STAFF_WATERMARK_ROUTES = [
  '/data-records', '/submissions/', '/taxpayers', '/taxpayer-360', '/cases', '/flagged',
  '/linkage', '/tax-net', '/triage', '/scan/', '/cross-state', '/data-quality',
  '/declared-income', '/agent-signals',
];
export const PROVIDER_WATERMARK_ROUTES = ['/provider/submissions/'];

export function needsWatermark(pathname: string, routes: string[]) {
  return routes.some((r) => (r.endsWith('/') ? pathname.startsWith(r) : pathname === r || pathname.startsWith(`${r}/`)));
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function stamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Why the overlay no longer does its job, or null when it is intact. Checks the
 * rendered result rather than the markup, so a hiding stylesheet rule counts
 * the same as deleting the node. The image itself is not compared: dark-mode
 * extensions legitimately rewrite inline backgrounds.
 */
function tamperReason(el: HTMLElement | null): string | null {
  if (!el || !el.isConnected) return 'removed';
  const cs = getComputedStyle(el);
  if (cs.display === 'none') return 'display:none';
  if (cs.visibility !== 'visible') return 'hidden';
  if (Number(cs.opacity) < 0.99) return 'opacity';
  if (cs.position !== 'fixed') return 'repositioned';
  if (!cs.backgroundImage || cs.backgroundImage === 'none') return 'image removed';
  const r = el.getBoundingClientRect();
  if (r.width < window.innerWidth * 0.9 || r.height < window.innerHeight * 0.9) return 'resized';
  if (r.left > 4 || r.top > 4) return 'moved';
  return null;
}

/** Inline styles for the overlay node; set directly, since React does not own it. */
const OVERLAY_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed', top: '0', right: '0', bottom: '0', left: '0', zIndex: '80',
  pointerEvents: 'none', userSelect: 'none', backgroundRepeat: 'repeat',
};

/**
 * Tiled, diagonal watermark naming the signed-in viewer, over the whole screen
 * (and on print), so a screenshot or photo of the data identifies who opened it.
 * Click-through and invisible to screen readers.
 *
 * If the overlay is removed or hidden (e.g. from the browser's developer tools)
 * `onTamper` fires once with the reason; the caller records it and ends the
 * session. Until then the screen is covered.
 *
 * The overlay node is created here rather than rendered by React: if someone
 * deletes it, React would otherwise crash trying to remove a node that is no
 * longer in the document, instead of showing the cover.
 */
export default function ViewerWatermark({
  name, email, onTamper,
}: { name: string; email?: string | null; onTamper?: (reason: string) => void }) {
  const [now, setNow] = useState(() => new Date());
  const [tampered, setTampered] = useState<string | null>(null);
  const node = useRef<HTMLDivElement | null>(null);
  const fired = useRef(false);
  const onTamperRef = useRef(onTamper);
  onTamperRef.current = onTamper;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const background = useMemo(() => {
    const line1 = esc(name);
    const line2 = esc([email, stamp(now)].filter(Boolean).join(' · '));
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="260">` +
      `<g transform="rotate(-28 210 130)" fill="rgb(100,116,139)" fill-opacity="0.16" font-family="Inter,Arial,sans-serif" text-anchor="middle">` +
      `<text x="210" y="124" font-size="20" font-weight="600">${line1}</text>` +
      `<text x="210" y="148" font-size="13">${line2}</text>` +
      `</g></svg>`;
    return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
  }, [name, email, now]);

  // Layout effect, not a passive one: the overlay exists before first paint, and
  // the watcher is gone before anything else on the page is torn down.
  useLayoutEffect(() => {
    const el = document.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    el.dataset.viewerWatermark = '';
    Object.assign(el.style, OVERLAY_STYLE);
    el.style.setProperty('-webkit-print-color-adjust', 'exact');
    el.style.setProperty('print-color-adjust', 'exact');
    document.body.appendChild(el);
    node.current = el;

    const check = () => {
      if (fired.current) return;
      const reason = tamperReason(el);
      if (!reason) return;
      fired.current = true;
      setTampered(reason);
      onTamperRef.current?.(reason);
    };
    // Mutations catch an edit the moment it happens; the interval catches
    // stylesheet rules, which change rendering without mutating the node.
    const mo = new MutationObserver(check);
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    const iv = setInterval(check, 1000);
    window.addEventListener('resize', check);
    return () => {
      mo.disconnect(); clearInterval(iv); window.removeEventListener('resize', check);
      el.remove();
      node.current = null;
    };
  }, []);

  // The image carries the minute-stamp, so it is refreshed in place.
  useLayoutEffect(() => {
    if (node.current) node.current.style.backgroundImage = background;
  }, [background]);

  if (!tampered) return null;
  return (
    <div role="alert" className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900 p-6 text-center text-white">
      <div className="max-w-md">
        <p className="text-lg font-semibold">The viewer watermark was removed.</p>
        <p className="mt-2 text-sm text-slate-300">This has been recorded against your account and you are being signed out.</p>
      </div>
    </div>
  );
}
