import type { SVGProps } from 'react';

/**
 * Inline line-icon set (no dependency). Consistent 24×24 grid, 1.5 stroke,
 * round caps/joins — a coherent institutional icon language replacing the
 * previous emoji. Add a case here to extend; keep the visual weight uniform.
 */
export type IconName =
  | 'dashboard' | 'providers' | 'taxpayers' | 'compass' | 'target' | 'chart'
  | 'document' | 'upload' | 'calendar' | 'link' | 'records' | 'scale'
  | 'flag' | 'search' | 'robot' | 'dna' | 'scroll' | 'bell' | 'trend'
  | 'bank' | 'unlock' | 'shield' | 'folder' | 'users' | 'settings' | 'download'
  | 'signal' | 'gavel' | 'menu';

const PATHS: Record<IconName, React.ReactNode> = {
  dashboard: <><path d="M3.75 9.75 12 3l8.25 6.75" /><path d="M5.25 8.5V19a1 1 0 0 0 1 1H9.5v-5.25h5V20h3.25a1 1 0 0 0 1-1V8.5" /></>,
  providers: <><path d="M4 20h16" /><path d="M5 20V9l7-4 7 4v11" /><path d="M9 20v-6h6v6" /><path d="M9.5 9.5h.01M14.5 9.5h.01" /></>,
  taxpayers: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 6.5a3 3 0 0 1 0 5.5" /><path d="M17 14.5a5.5 5.5 0 0 1 3.5 4.5" /></>,
  compass: <><circle cx="12" cy="12" r="8.5" /><path d="m15 9-2 5-4 1 2-5z" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="0.5" fill="currentColor" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><rect x="7" y="12" width="3" height="5" rx="0.5" /><rect x="12" y="8" width="3" height="9" rx="0.5" /><rect x="17" y="14" width="3" height="3" rx="0.5" /></>,
  document: <><path d="M7 3.5h6l5 5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" /><path d="M13 3.5V9h5" /><path d="M9 13h6M9 16.5h6" /></>,
  upload: <><path d="M12 15V4.5" /><path d="m8 8 4-4 4 4" /><path d="M5 15v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="1.5" /><path d="M4 9h16M8 3.5v3M16 3.5v3" /><path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01" /></>,
  link: <><path d="M9 15l6-6" /><path d="M10.5 6.5 12 5a4 4 0 0 1 5.7 5.7L16 12.5" /><path d="M13.5 17.5 12 19a4 4 0 0 1-5.7-5.7L8 11.5" /></>,
  records: <><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M4 9h16M9 9v11" /></>,
  scale: <><path d="M12 4v16" /><path d="M7 20h10" /><path d="M5 8h14" /><path d="m5 8-2.5 5a2.5 2.5 0 0 0 5 0z" /><path d="m19 8-2.5 5a2.5 2.5 0 0 0 5 0z" /></>,
  flag: <><path d="M5.5 21V4" /><path d="M5.5 4.5h11l-2 3.5 2 3.5h-11" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></>,
  robot: <><rect x="5" y="8" width="14" height="11" rx="2" /><path d="M12 4.5v3.5M12 4.5a1 1 0 1 0 0-.01" /><circle cx="9.5" cy="13" r="1" fill="currentColor" stroke="none" /><circle cx="14.5" cy="13" r="1" fill="currentColor" stroke="none" /><path d="M3 12v3M21 12v3" /></>,
  dna: <><path d="M8 3c0 6 8 6 8 12M16 3c0 6-8 6-8 12" /><path d="M8 21c0-2 8-2 8 0M8 3c0 2 8 2 8 0" /><path d="M9 8h6M9 16h6" /></>,
  scroll: <><path d="M6 4h9a2 2 0 0 1 2 2v11a3 3 0 0 0 3 3H8a2 2 0 0 1-2-2z" /><path d="M6 4a2 2 0 0 0-2 2v2h4" /><path d="M9 9h5M9 12.5h5" /></>,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 19a2 2 0 0 0 4 0" /></>,
  trend: <><path d="M4 20V4M4 20h16" /><path d="m7 14 3-3 3 2 4-5" /><path d="M17 8h1.5V9.5" /></>,
  bank: <><path d="M4 20h16" /><path d="m12 3 8 4H4z" /><path d="M6 9v8M10 9v8M14 9v8M18 9v8" /></>,
  unlock: <><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V8a4 4 0 0 1 7.5-1.9" /></>,
  shield: <><path d="M12 3.5 5 6v5.5c0 4.5 3 7.5 7 8.5 4-1 7-4 7-8.5V6z" /><path d="m9.5 12 1.8 1.8 3.2-3.6" /></>,
  folder: <><path d="M4 7a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /></>,
  users: <><circle cx="8.5" cy="9" r="3" /><path d="M3 19a5.5 5.5 0 0 1 11 0" /><path d="M15.5 6.2a3 3 0 0 1 0 5.6" /><path d="M16.5 14.2a5.5 5.5 0 0 1 4 4.8" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" /></>,
  download: <><path d="M12 4v10.5" /><path d="m8 11 4 4 4-4" /><path d="M5 19h14" /></>,
  signal: <><path d="M4.5 9a10 10 0 0 1 15 0" /><path d="M7.5 12a6 6 0 0 1 9 0" /><path d="M12 18v-2.5" /><circle cx="12" cy="15" r="0.6" fill="currentColor" stroke="none" /></>,
  gavel: <><path d="M9 11.5 4.3 16.2a1.6 1.6 0 0 0 2.3 2.3L11.3 14" /><path d="m8.2 8.7 5.6 5.6" /><path d="m11 5.9 5.6 5.6" /><path d="M13.8 3.1 19.4 8.7" /><path d="M13 20.5h7" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
};

export default function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
