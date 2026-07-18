"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@oziow/ui";
import { Activity, CreditCard, Users, RefreshCw, Server, AlertCircle } from "lucide-react";

export function KpiDashboard() {
  const { session, user } = useAuth();
  const [globalKpis, setGlobalKpis] = useState<any>(null);
  const [financeKpis, setFinanceKpis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Check roles
  const roles = user?.app_metadata?.platform_roles || [];
  const canViewGlobal = roles.includes('PLATFORM_OWNER') || roles.includes('PLATFORM_FINANCE') || roles.includes('PLATFORM_SUPPORT');
  const canViewFinance = roles.includes('PLATFORM_OWNER') || roles.includes('PLATFORM_FINANCE');

  const fetchKpis = async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError("");

    try {
      const headers = { Authorization: `Bearer ${session.access_token}` };
      
      // Fetch Global KPIs
      if (canViewGlobal) {
        const resGlobal = await fetch('http://localhost:3000/v1/superadmin/kpis/global', { headers });
        if (resGlobal.ok) {
          setGlobalKpis(await resGlobal.json());
        }
      }

      // Fetch Finance KPIs
      if (canViewFinance) {
        const resFinance = await fetch('http://localhost:3000/v1/superadmin/kpis/financial', { headers });
        if (resFinance.ok) {
          setFinanceKpis(await resFinance.json());
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to load KPIs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKpis();
  }, [session, canViewGlobal, canViewFinance]);

  const handleRefresh = async () => {
    if (!session?.access_token) return;
    setIsRefreshing(true);
    try {
      const headers = { Authorization: `Bearer ${session.access_token}` };
      await fetch('http://localhost:3000/v1/superadmin/kpis/refresh', { method: 'POST', headers });
      await fetchKpis();
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!canViewGlobal && !canViewFinance) {
    return (
      <div className="glass-panel p-8 rounded-2xl flex items-center justify-center text-muted-foreground flex-col gap-4">
        <AlertCircle className="w-12 h-12 text-yellow-500/50" />
        <p>Vous n'avez pas les droits nécessaires pour voir les KPIs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold tracking-tight">Vue d'ensemble de la plateforme</h2>
        <button 
          onClick={handleRefresh} 
          disabled={isRefreshing || loading}
          className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-all hover-lift disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Rafraîchir
        </button>
      </div>

      {error && <div className="text-red-400 bg-red-400/10 p-4 rounded-lg text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {canViewGlobal && (
          <>
            <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group hover-lift">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Users className="w-24 h-24 text-primary" />
              </div>
              <div className="relative z-10">
                <p className="text-sm font-medium text-muted-foreground mb-1">Locataires Actifs</p>
                <div className="text-4xl font-bold">
                  {loading ? '...' : globalKpis?.total_tenants || 0}
                </div>
              </div>
            </div>
            
            <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group hover-lift">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Activity className="w-24 h-24 text-green-500" />
              </div>
              <div className="relative z-10">
                <p className="text-sm font-medium text-muted-foreground mb-1">Utilisateurs Total</p>
                <div className="text-4xl font-bold">
                  {loading ? '...' : globalKpis?.total_users || 0}
                </div>
              </div>
            </div>
          </>
        )}

        {canViewFinance && (
          <>
            <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group hover-lift">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <CreditCard className="w-24 h-24 text-blue-500" />
              </div>
              <div className="relative z-10">
                <p className="text-sm font-medium text-muted-foreground mb-1">MRR (Revenu Mensuel)</p>
                <div className="text-4xl font-bold text-blue-400">
                  {loading ? '...' : `$${financeKpis?.mrr || 0}`}
                </div>
              </div>
            </div>
            
            <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group hover-lift">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Server className="w-24 h-24 text-purple-500" />
              </div>
              <div className="relative z-10">
                <p className="text-sm font-medium text-muted-foreground mb-1">Abonnements Pro</p>
                <div className="text-4xl font-bold text-purple-400">
                  {loading ? '...' : financeKpis?.active_subscriptions || 0}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
