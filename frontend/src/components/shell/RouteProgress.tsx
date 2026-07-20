'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Slim top progress bar that flashes on route change — the standard enterprise
 * feedback that a navigation is in flight. App Router client navigations are
 * fast, so this is a timed reassurance animation keyed on the pathname rather
 * than a real load meter. Respects prefers-reduced-motion via the CSS transition
 * (globals.css clamps durations).
 */
export default function RouteProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const first = useRef(true);

  useEffect(() => {
    // Skip the very first mount (no navigation happened yet).
    if (first.current) {
      first.current = false;
      return;
    }
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setVisible(true);
    setWidth(12);
    timers.current.push(setTimeout(() => setWidth(72), 60));
    timers.current.push(setTimeout(() => setWidth(100), 320));
    timers.current.push(
      setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 560),
    );
    return () => timers.current.forEach(clearTimeout);
  }, [pathname]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5" aria-hidden>
      <div
        className="h-full bg-teal-500 transition-all duration-200 ease-out"
        style={{ width: `${width}%`, opacity: visible ? 1 : 0 }}
      />
    </div>
  );
}
