'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import ProviderNav from '@/components/ProviderNav';
import { useProviderAuthStore } from '@/store/providerAuthStore';

export default function ProviderPortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { token, user } = useProviderAuthStore();
  const isLogin = pathname === '/provider/login';

  useEffect(() => {
    if (!isLogin && (!token || !user)) {
      router.replace('/provider/login');
    }
  }, [isLogin, token, user, router]);

  if (isLogin) return <>{children}</>;

  if (!token || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400 text-sm">
        Redirecting to sign in…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <ProviderNav />
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
