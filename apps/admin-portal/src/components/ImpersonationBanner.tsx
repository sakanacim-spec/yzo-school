"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@oziow/ui";
import { AlertTriangle, Clock, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export function ImpersonationBanner() {
  const { session, user, supabase } = useAuth();
  const router = useRouter();
  const [timeLeft, setTimeLeft] = useState<string>("");

  let isImpersonating = false;
  if (session?.access_token) {
    try {
      const payload = JSON.parse(atob(session.access_token.split('.')[1]));
      isImpersonating = payload.app_metadata?.impersonation_session_id;
    } catch (e) {}
  }

  useEffect(() => {
    if (!isImpersonating || !session) return;

    // Get expiration from token or user metadata if available
    const checkExpiry = setInterval(() => {
      if (!session.expires_at) return;
      const expDate = new Date(session.expires_at * 1000);
      const now = new Date();
      const diff = expDate.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft("00:00");
        clearInterval(checkExpiry);
        window.location.reload();
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(checkExpiry);
  }, [isImpersonating, session]);

  if (!isImpersonating) return null;

  const handleExit = async () => {
    try {
       const token = session?.access_token;
       await fetch('http://localhost:3000/v1/superadmin/impersonate/revoke', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ sessionId: isImpersonating })
       });
       
       const originalToken = localStorage.getItem('original_session_token');
       const originalRefresh = localStorage.getItem('original_refresh_token') || '';
       if (originalToken && supabase) {
          await supabase.auth.setSession({ access_token: originalToken, refresh_token: originalRefresh });
       }
       localStorage.removeItem('original_session_token');
       localStorage.removeItem('original_refresh_token');
       window.location.href = '/dashboard';
    } catch (err) {
       console.error("Failed to revoke session", err);
       const originalToken = localStorage.getItem('original_session_token');
       const originalRefresh = localStorage.getItem('original_refresh_token') || '';
       if (originalToken && supabase) {
          await supabase.auth.setSession({ access_token: originalToken, refresh_token: originalRefresh });
       }
       localStorage.removeItem('original_session_token');
       localStorage.removeItem('original_refresh_token');
       window.location.href = '/dashboard';
    }
  };

  return (
    <div className="fixed top-0 left-0 w-full z-50 bg-gradient-to-r from-orange-500 to-red-600 text-white px-4 py-2 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 animate-pulse" />
        <span className="font-semibold text-sm">
          Mode Impersonation Actif
        </span>
        <span className="text-xs bg-black/20 px-2 py-0.5 rounded-full font-mono">
          Tenant: {user?.app_metadata?.tenant_id}
        </span>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-sm font-mono bg-black/20 px-3 py-1 rounded-md">
          <Clock className="h-4 w-4" />
          {timeLeft || "--:--"}
        </div>
        
        <button 
          onClick={handleExit}
          className="flex items-center gap-2 text-sm font-medium hover:bg-white/20 px-3 py-1 rounded-md transition-colors border border-white/30"
        >
          <XCircle className="h-4 w-4" />
          Quitter l'impersonation
        </button>
      </div>
    </div>
  );
}
