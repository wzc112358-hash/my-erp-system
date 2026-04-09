import React, { createContext, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth';
import type { User } from '@/types/auth';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export { AuthContext };

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token, isAuthenticated, login, logout, checkAuth, setAuth } = useAuthStore();

  const checkAuthCallback = useCallback(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    checkAuthCallback();
  }, [checkAuthCallback]);

  useEffect(() => {
    if (token && user && !isAuthenticated) {
      setAuth(user, token);
    }
  }, [token, user, isAuthenticated, setAuth]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        login,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
