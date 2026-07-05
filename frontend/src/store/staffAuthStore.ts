'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StaffUser } from '@/lib/api/auth';

interface StaffAuthState {
  user: StaffUser | null;
  token: string | null;
  hasHydrated: boolean;
  setAuth: (user: StaffUser, token: string) => void;
  setUser: (user: StaffUser) => void;
  clearAuth: () => void;
  setHasHydrated: (v: boolean) => void;
  isAuthenticated: () => boolean;
}

export const useStaffAuthStore = create<StaffAuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      hasHydrated: false,
      setAuth: (user, token) => {
        if (typeof window !== 'undefined') localStorage.setItem('bizdata_staff_token', token);
        set({ user, token });
      },
      setUser: (user) => set({ user }),
      clearAuth: () => {
        if (typeof window !== 'undefined') localStorage.removeItem('bizdata_staff_token');
        set({ user: null, token: null });
      },
      setHasHydrated: (v) => set({ hasHydrated: v }),
      isAuthenticated: () => !!get().token && !!get().user,
    }),
    {
      name: 'bizdata-staff-auth',
      // `hasHydrated` is runtime-only — don't persist it.
      partialize: (s) => ({ user: s.user, token: s.token }),
      onRehydrateStorage: () => (state) => {
        // Fires once the persisted value has been read back into the store.
        state?.setHasHydrated(true);
      },
    },
  ),
);
