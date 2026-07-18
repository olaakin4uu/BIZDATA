'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import StaffSidebar from '@/components/StaffSidebar';
import UserMenu from '@/components/UserMenu';
import { useStaffAuthStore } from '@/store/staffAuthStore';
import { authApi } from '@/lib/api/auth';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { token, user, hasHydrated, clearAuth, setUser } = useStaffAuthStore();
  const isLoginRoute = pathname === '/login';
  const isChangePwRoute = pathname === '/change-password';
  // Routes that render without the app chrome and don't require a full session.
  const isBareRoute = isLoginRoute || isChangePwRoute;

  useEffect(() => {
    // Only decide to redirect AFTER the persisted auth has hydrated from
    // localStorage — otherwise a direct URL load flickers to /login.
    if (hasHydrated && !isBareRoute && (!token || !user)) {
      router.replace('/login');
      return;
    }
    // A user whose password was reset by an admin must set a new one before
    // reaching any app page. Send them to the forced-change screen from anywhere.
    if (hasHydrated && token && user?.mustChangePassword && !isChangePwRoute) {
      router.replace('/change-password');
    }
  }, [hasHydrated, isBareRoute, isChangePwRoute, token, user, router]);

  const handleSignOut = () => {
    clearAuth();
    router.replace('/login');
  };

  const handleUploadAvatar = async (file: File) => {
    const updated = await authApi.uploadStaffAvatar(file);
    setUser(updated);
  };

  if (isBareRoute) {
    return <>{children}</>;
  }

  // Wait for hydration before rendering or redirecting — avoids the flicker.
  if (!hasHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400 text-sm">
        Loading…
      </div>
    );
  }

  if (!token || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400 text-sm">
        Redirecting to sign in…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <StaffSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Global top bar with the user profile menu pinned top-right. */}
        <header className="flex h-14 flex-shrink-0 items-center justify-end border-b border-slate-200 bg-white px-6">
          <UserMenu user={user} onSignOut={handleSignOut} onUploadAvatar={handleUploadAvatar} accountHref="/account" />
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
