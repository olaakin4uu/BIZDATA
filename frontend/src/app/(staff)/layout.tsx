'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import StaffSidebar from '@/components/StaffSidebar';
import { useStaffAuthStore } from '@/store/staffAuthStore';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { token, user } = useStaffAuthStore();
  const isLoginRoute = pathname === '/login';

  useEffect(() => {
    if (!isLoginRoute && (!token || !user)) {
      router.replace('/login');
    }
  }, [isLoginRoute, token, user, router]);

  if (isLoginRoute) {
    return <>{children}</>;
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
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
