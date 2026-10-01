'use client';
import { useCallback, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import ProviderNav from '@/components/ProviderNav';
import IdleWarningDialog from '@/components/shell/IdleWarningDialog';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS, PROVIDER_IDLE_KEY } from '@/lib/sessionPolicy';
import { useProviderAuthStore } from '@/store/providerAuthStore';

export default function ProviderPortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { token, user, clearAuth } = useProviderAuthStore();
  // Public auth routes render without the portal chrome and need no session.
  const isPublicAuthRoute =
    pathname === '/provider/login' ||
    pathname === '/provider/forgot-password' ||
    pathname === '/provider/reset-password';

  // A provider forced to change their password may only reach the profile page
  // until they do — no navigating around it to the dashboard etc.
  const mustChange = !!user?.mustChangePassword;
  const onProfile = pathname === '/provider/profile';

  useEffect(() => {
    if (isPublicAuthRoute) return;
    if (!token || !user) { router.replace('/provider/login'); return; }
    if (mustChange && !onProfile) router.replace('/provider/profile');
  }, [isPublicAuthRoute, token, user, mustChange, onProfile, router]);

  // Same sign-out as the portal nav's button.
  const handleSignOut = useCallback(() => {
    clearAuth();
    router.replace('/provider/login');
  }, [clearAuth, router]);

  // Idle sign-out on the wall clock, for any signed-in provider session.
  const { isWarning, secondsLeft, stayLoggedIn } = useIdleTimeout({
    idleMs: IDLE_TIMEOUT_MS,
    warningMs: IDLE_WARNING_MS,
    enabled: !!token && !!user && !isPublicAuthRoute,
    onLogout: handleSignOut,
    storageKey: PROVIDER_IDLE_KEY,
  });

  if (isPublicAuthRoute) return <>{children}</>;

  if (!token || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-[var(--ink-3)] text-sm">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
        Redirecting to sign in…
      </div>
    );
  }

  // Block everything but the profile page while a password change is mandatory.
  if (mustChange && !onProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-[var(--ink-3)] text-sm">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
        Please set a new password to continue…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ProviderNav />
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">{children}</main>

      {/* Idle session timeout warning */}
      <IdleWarningDialog
        open={isWarning}
        secondsLeft={secondsLeft}
        onStayLoggedIn={stayLoggedIn}
        onLogoutNow={handleSignOut}
      />
    </div>
  );
}
