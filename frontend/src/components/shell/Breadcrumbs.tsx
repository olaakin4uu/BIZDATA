'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV, isNavActive, activeNav } from '@/components/StaffSidebar';

interface Crumb {
  label: string;
  href?: string;
}

function segLabel(seg: string): string {
  const isId = /^[0-9a-f]{6,}$/i.test(seg) || /^[0-9a-f-]{16,}$/i.test(seg) || /^\d+$/.test(seg);
  if (isId) return `#${seg.slice(0, 8)}`;
  const s = seg.replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A navigable breadcrumb trail derived from the route + the nav model, including
 *  dynamic detail segments (e.g. Enforcement / Cases / #a1b2c3d4). Replaces the
 *  old static "Section · Page" label. */
export default function Breadcrumbs() {
  const pathname = usePathname() ?? '';
  const match = NAV.find((n) => isNavActive(n.href, pathname));
  if (!match) return null;

  const nav = activeNav(pathname);
  const crumbs: Crumb[] = [];
  if (nav?.section) crumbs.push({ label: nav.section }); // a category label, not a route
  crumbs.push({ label: match.label, href: match.href });

  let acc = match.href;
  for (const seg of pathname.slice(match.href.length).split('/').filter(Boolean)) {
    acc += `/${seg}`;
    crumbs.push({ label: segLabel(seg), href: acc });
  }

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={i} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && (
                <span className="select-none text-[var(--ink-3)]" aria-hidden>
                  /
                </span>
              )}
              {c.href && !last ? (
                <Link href={c.href} className="truncate text-sm text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]">
                  {c.label}
                </Link>
              ) : (
                <span
                  className={`truncate text-sm ${last ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-3)]'}`}
                  aria-current={last ? 'page' : undefined}
                >
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
