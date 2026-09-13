import { create } from 'zustand';
import { pb, switchSystem } from '@/lib/pocketbase';
import type { AuthState, User } from '@/types/auth';

const clearedAuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
} as const;

export const useAuthStore = create<AuthState>()((set, get) => ({
  ...clearedAuthState,
  isAuthChecked: false,

  login: async (email: string, password: string) => {
    const authData = await pb.collection('users').authWithPassword(email, password);
    const user = authData.record as unknown as User;
    const token = authData.token;

    pb.authStore.save(token, authData.record);
    set({ user, token, isAuthenticated: true, isAuthChecked: true });
  },

  logout: () => {
    pb.authStore.clear();
    localStorage.removeItem('auth-storage');
    set({ ...clearedAuthState, isAuthChecked: true });
  },

  selectSystem: (system) => {
    switchSystem(system);
    set({ ...clearedAuthState, isAuthChecked: true });
  },

  setAuth: (user: User, token: string) => {
    const currentState = get();
    if (currentState.token !== token) {
      pb.authStore.save(token, user as never);
      set({ user, token, isAuthenticated: true, isAuthChecked: true });
    }
  },

  checkAuth: async () => {
    localStorage.removeItem('auth-storage');
    if (!localStorage.getItem('erp_system') || !pb.authStore.isValid) {
      pb.authStore.clear();
      set({ ...clearedAuthState, isAuthChecked: true });
      return;
    }

    try {
      const authData = await pb.collection('users').authRefresh();
      const user = authData.record as unknown as User;
      const token = authData.token;
      pb.authStore.save(token, authData.record);
      set({ user, token, isAuthenticated: true, isAuthChecked: true });
    } catch {
      pb.authStore.clear();
      set({ ...clearedAuthState, isAuthChecked: true });
    }
  },
}));
