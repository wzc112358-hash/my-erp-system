export type UserRole = 'sales' | 'purchasing' | 'manager';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  type: UserRole;
  created: string;
  updated: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setAuth: (user: User, token: string) => void;
  checkAuth: () => Promise<void>;
}

export interface LoginCredentials {
  email: string;
  password: string;
}
