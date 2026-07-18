"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@oziow/ui";
import { useState } from "react";

export function AppProviders({
  children,
  supabaseUrl,
  supabaseAnonKey,
}: {
  children: React.ReactNode;
  supabaseUrl: string;
  supabaseAnonKey: string;
}) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey}>
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}
