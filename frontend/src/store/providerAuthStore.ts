'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProviderUser } from '@/lib/api/auth';

interface ProviderAuthState {
  user: ProviderUser | null;
  token: string | null;
  setAuth: (user: ProviderUser, token: string) => void;
  setUser: (user: ProviderUser) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

export const useProviderAuthStore = create<ProviderAuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        if (typeof window !== 'undefined') localStorage.setItem('bizdata_provider_token', token);
        set({ user, token });
      },
      setUser: (user) => set({ user }),
      clearAuth: () => {
        if (typeof window !== 'undefined') localStorage.removeItem('bizdata_provider_token');
        set({ user: null, token: null });
      },
      isAuthenticated: () => !!get().token && !!get().user,
    }),
    { name: 'bizdata-provider-auth' },
  ),
);
