import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role_id: 'admin' | 'employee';
  active: boolean;
}

export interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
    isAuthenticated: false,
  });

  // Obtener perfil del usuario
  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }

    return data as UserProfile;
  };

  // Inicializar autenticación y escuchar cambios
  useEffect(() => {
    // Obtener sesión actual
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        const profile = await fetchProfile(session.user.id);
        setAuthState({
          user: session.user,
          profile,
          loading: false,
          isAuthenticated: true,
        });
      } else {
        setAuthState({
          user: null,
          profile: null,
          loading: false,
          isAuthenticated: false,
        });
      }
    };

    initAuth();

    // Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          if (session?.user) {
            const profile = await fetchProfile(session.user.id);
            setAuthState({
              user: session.user,
              profile,
              loading: false,
              isAuthenticated: true,
            });
          }
        } else if (event === 'SIGNED_OUT') {
          setAuthState({
            user: null,
            profile: null,
            loading: false,
            isAuthenticated: false,
          });
        }
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Login con email y password
  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    if (data.user) {
      const profile = await fetchProfile(data.user.id);
      setAuthState({
        user: data.user,
        profile,
        loading: false,
        isAuthenticated: true,
      });
    }

    return data;
  };

  // Logout
  const logout = async () => {
    await supabase.auth.signOut();
    setAuthState({
      user: null,
      profile: null,
      loading: false,
      isAuthenticated: false,
    });
  };

  return {
    ...authState,
    login,
    logout,
  };
}
