"use client";

import { useMemo } from "react";
import { OziowClient } from "@oziow/client";
import { useAuth } from "@oziow/ui";

export function useOziow() {
  const { session } = useAuth();
  
  const client = useMemo(() => {
    // Dans un vrai projet, l'URL viendrait des env vars.
    // Le token du user connecté (JWT de Supabase) sert de Bearer.
    return new OziowClient({
      baseURL: "http://localhost:3000/v1",
      token: session?.access_token,
    });
  }, [session?.access_token]);

  return client;
}
