'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StaffUser } from '@/lib/api/auth';

interface StaffAuthState {
  user: StaffUser | null;
  token: string | null;
  setAuth: (user: StaffUser, token: string) => void;
  setUser: (user: StaffUser) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

export const useStaffAuthStore = create<StaffAuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        if (typeof window !== 'undefined') localStorage.setItem('bizdata_staff_token', token);
        set({ user, token });
      },
      setUser: (user) => set({ user }),
      clearAuth: () => {
        if (typeof window !== 'undefined') localStorage.removeItem('bizdata_staff_token');
        set({ user: null, token: null });
      },
      isAuthenticated: () => !!get().token && !!get().user,
    }),
    { name: 'bizdata-staff-auth' },
  ),
);
