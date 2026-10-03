import { createContext, useContext, type ReactNode } from 'react';
import { useAuth, type AuthState } from '@/hooks/useAuth';

const AuthContext = createContext<(AuthState & { logout: () => Promise<void> }) | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return context;
}
