'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon, { type IconName } from '@/components/Icon';
import { NAV } from '@/components/StaffSidebar';
import { effectiveTheme, setTheme } from '@/lib/theme';

export const COMMAND_OPEN_EVENT = 'bizdata:command-open';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: IconName;
  keywords: string;
  run: () => void;
}

/**
 * ⌘K / Ctrl-K command palette — the primary wayfinding tool for a 26-destination
 * console. Navigate to any page or run a quick action by typing. Opens on the
 * keyboard shortcut or when the topbar search dispatches COMMAND_OPEN_EVENT.
 * Full keyboard control: ↑/↓ to move, Enter to run, Esc to close.
 */
export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  const commands = useMemo<Command[]>(() => {
    const navCmds: Command[] = NAV.map((n) => ({
      id: `nav:${n.href}`,
      label: n.label,
      hint: n.section ? n.section : 'Go to page',
      icon: n.icon,
      keywords: `${n.label} ${n.section ?? ''} ${n.href}`.toLowerCase(),
      run: () => router.push(n.href),
    }));
    const actions: Command[] = [
      {
        id: 'action:theme',
        label: 'Toggle light / dark theme',
        hint: 'Action',
        icon: 'settings',
        keywords: 'theme dark light mode toggle appearance',
        run: () => setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark'),
      },
    ];
    return [...navCmds, ...actions];
  }, [router]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    const tokens = q.split(/\s+/);
    return commands.filter((c) => tokens.every((t) => c.keywords.includes(t)));
  }, [query, commands]);

  // Open on ⌘K / Ctrl-K, or when the topbar search dispatches the event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener('keydown', onKey);
    window.addEventListener(COMMAND_OPEN_EVENT, onOpen);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener(COMMAND_OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      prevFocus.current = document.activeElement as HTMLElement | null;
      setQuery('');
      setActive(0);
      // focus after paint
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        clearTimeout(t);
        document.body.style.overflow = prevOverflow;
        prevFocus.current?.focus?.();
      };
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const choose = (i: number) => {
    const cmd = results[i];
    if (!cmd) return;
    setOpen(false);
    cmd.run();
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-900/50 p-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--elev-3)] rise-in"
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--line)] px-4">
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" className="text-[var(--ink-3)]" aria-hidden>
            <circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search pages and actions…"
            aria-label="Search pages and actions"
            aria-controls="command-list"
            className="flex-1 bg-transparent py-3.5 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-3)]"
          />
          <kbd className="hidden rounded border border-[var(--line)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-3)] sm:block">Esc</kbd>
        </div>

        <ul id="command-list" ref={listRef} role="listbox" className="max-h-80 overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-[var(--ink-3)]">No matches for “{query}”.</li>
          ) : (
            results.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === active} data-idx={i}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                    i === active ? 'bg-[var(--surface-2)] text-[var(--ink)]' : 'text-[var(--ink-2)]'
                  }`}
                >
                  <Icon name={c.icon} width={17} height={17} className="flex-shrink-0 text-[var(--ink-3)]" />
                  <span className="flex-1 truncate">{c.label}</span>
                  {c.hint && <span className="text-xs text-[var(--ink-3)]">{c.hint}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
