'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import ProviderNav from '@/components/ProviderNav';
import { useProviderAuthStore } from '@/store/providerAuthStore';

export default function ProviderPortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { token, user } = useProviderAuthStore();
  // Public auth routes render without the portal chrome and need no session.
  const isPublicAuthRoute =
    pathname === '/provider/login' ||
    pathname === '/provider/forgot-password' ||
    pathname === '/provider/reset-password';

  useEffect(() => {
    if (!isPublicAuthRoute && (!token || !user)) {
      router.replace('/provider/login');
    }
  }, [isPublicAuthRoute, token, user, router]);

  if (isPublicAuthRoute) return <>{children}</>;

  if (!token || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-[var(--ink-3)] text-sm">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
        Redirecting to sign in…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ProviderNav />
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
