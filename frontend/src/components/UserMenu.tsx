'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface UserMenuUser {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  role?: string | null;
  avatarUrl?: string | null;
}

interface UserMenuProps {
  user: UserMenuUser | null;
  onSignOut: () => void;
  /** Uploads the chosen photo and returns the updated user (with new avatarUrl). */
  onUploadAvatar: (file: File) => Promise<void>;
  /** Trigger button styling — 'light' for white top bars, 'dark' for the teal provider bar. */
  variant?: 'light' | 'dark';
  /** Route for the "Account & security" item. Omit to hide it (e.g. provider bar has no such page). */
  accountHref?: string;
}

export default function UserMenu({ user, onSignOut, onUploadAvatar, variant = 'light', accountHref }: UserMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'User';
  const initials =
    [user?.firstName, user?.lastName]
      .filter(Boolean)
      .map((n) => n![0]?.toUpperCase())
      .join('') || 'U';
  const role = user?.role?.replace(/_/g, ' ') ?? '';

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return; }
    if (file.size > 2 * 1024 * 1024) { setError('Photo must be 2MB or smaller.'); return; }
    setError(null);
    setUploading(true);
    try {
      await onUploadAvatar(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Avatar: photo if present, else initials.
  const Avatar = ({ size }: { size: number }) =>
    user?.avatarUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt={fullName}
        className="rounded-full object-cover ring-2 ring-white shadow-sm"
        style={{ width: size, height: size }}
      />
    ) : (
      <span
        className="flex items-center justify-center rounded-full bg-teal-600 font-semibold text-white ring-2 ring-white shadow-sm"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {initials}
      </span>
    );

  return (
    <div className="relative" ref={ref}>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />

      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors ${
          variant === 'dark' ? 'hover:bg-teal-700' : 'hover:bg-slate-100'
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar size={36} />
        <span className="hidden sm:flex flex-col items-start leading-tight">
          <span
            className={`text-sm font-medium truncate max-w-[10rem] ${
              variant === 'dark' ? 'text-white' : 'text-slate-800'
            }`}
          >
            {fullName}
          </span>
          <span
            className={`text-[10px] uppercase tracking-wide ${
              variant === 'dark' ? 'text-teal-200' : 'text-slate-400'
            }`}
          >
            {role}
          </span>
        </span>
        <svg
          className={`hidden sm:block h-4 w-4 transition-transform ${open ? 'rotate-180' : ''} ${
            variant === 'dark' ? 'text-teal-200' : 'text-slate-400'
          }`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg z-50"
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
            <Avatar size={44} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{fullName}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              {role && <p className="text-[10px] uppercase tracking-wide text-slate-400 mt-0.5">{role}</p>}
            </div>
          </div>

          <button
            onClick={() => fileRef.current?.click()}
            role="menuitem"
            disabled={uploading}
            className="flex w-full items-center gap-2 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {uploading ? 'Uploading…' : user?.avatarUrl ? 'Change photo' : 'Upload photo'}
          </button>

          {error && <p className="px-4 pb-2 text-xs text-red-500">{error}</p>}

          {accountHref && (
            <button
              onClick={() => { setOpen(false); router.push(accountHref); }}
              role="menuitem"
              className="flex w-full items-center gap-2 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors border-t border-slate-100"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Account &amp; security
            </button>
          )}

          <button
            onClick={onSignOut}
            role="menuitem"
            className="flex w-full items-center gap-2 px-4 py-3 text-sm text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors border-t border-slate-100"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
