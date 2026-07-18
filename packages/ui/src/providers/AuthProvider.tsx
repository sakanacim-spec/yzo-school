import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { Session, User, SupabaseClient } from '@supabase/supabase-js';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  supabase: SupabaseClient | null;
  signOut: () => Promise<void>;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  supabase: null,
  signOut: async () => {},
  isLoading: true,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ 
  children, 
  supabaseUrl, 
  supabaseAnonKey 
}: { 
  children: React.ReactNode, 
  supabaseUrl: string, 
  supabaseAnonKey: string 
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [supabaseClient] = useState(() => createClient(supabaseUrl, supabaseAnonKey));

  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabaseClient]);

  const signOut = async () => {
    await supabaseClient.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, supabase: supabaseClient, signOut, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};
