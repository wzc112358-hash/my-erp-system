import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { pb } from '@/lib/pocketbase';
import type { AuthState, User } from '@/types/auth';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: async (email: string, password: string) => {
        const authData = await pb.collection('users').authWithPassword(email, password);
        const user = authData.record as unknown as User;
        const token = authData.token;
        
        set({ user, token, isAuthenticated: true });
        pb.authStore.save(token, authData.record);
      },

      logout: () => {
        pb.authStore.clear();
        set({ user: null, token: null, isAuthenticated: false });
      },

      setAuth: (user: User, token: string) => {
        const currentState = get();
        if (currentState.token !== token) {
          pb.authStore.save(token, user as never);
          set({ user, token, isAuthenticated: true });
        }
      },

      checkAuth: async () => {
        if (pb.authStore.isValid) {
          const token = pb.authStore.token;
          const user = pb.authStore.model as unknown as User;
          if (user && token) {
            set({ user, token, isAuthenticated: true });
          }
        } else {
          const state = get();
          if (state.isAuthenticated) {
            set({ user: null, token: null, isAuthenticated: false });
          }
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, token: state.token, isAuthenticated: state.isAuthenticated }),
    }
  )
);
