"use client";

import { useAuth } from "@oziow/ui";
import { Check, X, Search, ShieldAlert, Settings } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

const mockTenants = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Yziow Education',
    plan: 'pro',
    active_modules: ['auth', 'organizations', 'users', 'roles', 'notifications', 'files'],
    is_active: true,
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Acme Corp ERP',
    plan: 'starter',
    active_modules: ['auth', 'users', 'billing'],
    is_active: true,
  }
];

const availableModules = [
  'auth', 'organizations', 'users', 'roles', 'files', 'notifications', 'billing', 'audit_logs'
];

export function TenantList() {
  const { session, user, supabase } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  // Check roles for impersonation
  const roles = user?.app_metadata?.platform_roles || [];
  const canImpersonate = roles.includes('PLATFORM_OWNER') || roles.includes('PLATFORM_SUPPORT');

  const filteredTenants = mockTenants.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.id.includes(searchTerm));

  const handleImpersonate = async (tenantId: string) => {
    if (!session?.access_token || !canImpersonate) return;
    setImpersonatingId(tenantId);
    try {
      const res = await fetch('http://localhost:3000/v1/superadmin/impersonate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ tenantId, justification: 'Support Technique' })
      });
      if (res.ok) {
        const data = await res.json();
        
        // Save the original session before impersonating
        localStorage.setItem('original_session_token', session.access_token);
        if (session.refresh_token) {
          localStorage.setItem('original_refresh_token', session.refresh_token);
        }

        if (supabase) {
           const { data: sessionData, error: sessionErr } = await supabase.auth.setSession({ 
             access_token: data.token, 
             refresh_token: session.refresh_token || '' 
           });
           console.error("SETSESSION RESULT USER META:", sessionData.session?.user?.app_metadata);
        }
      } else {
        alert("Erreur lors de l'impersonation");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setImpersonatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Locataires (Tenants)</h2>
          <p className="text-sm text-muted-foreground mt-1">Gérez les espaces de travail, plans et modules.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Rechercher..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 bg-black/20 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-primary/50 transition-colors w-64"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredTenants.map((tenant) => (
          <div key={tenant.id} className="glass-panel rounded-2xl p-6 transition-all hover:border-white/10">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-semibold flex items-center gap-3">
                  {tenant.name}
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                    tenant.plan === 'pro' 
                      ? 'bg-primary/20 text-primary border-primary/30' 
                      : 'bg-muted border-white/10 text-muted-foreground'
                  }`}>
                    {tenant.plan.toUpperCase()}
                  </span>
                </h3>
                <p className="text-muted-foreground text-sm mt-1 font-mono">{tenant.id}</p>
              </div>
              
              <div className="flex gap-2">
                <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium transition-all">
                  <Settings className="w-4 h-4" />
                  Sauvegarder
                </button>
                {canImpersonate && (
                  <button 
                    onClick={() => handleImpersonate(tenant.id)}
                    disabled={impersonatingId === tenant.id}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/20 rounded-lg text-sm font-medium transition-all"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    {impersonatingId === tenant.id ? 'Chargement...' : 'Impersonate'}
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Modules Actifs</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
                {availableModules.map((mod) => {
                  const isActive = tenant.active_modules.includes(mod);
                  return (
                    <div 
                      key={mod} 
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                        isActive 
                          ? 'bg-primary/10 border-primary/30 text-primary' 
                          : 'bg-black/20 border-white/5 text-muted-foreground opacity-50'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center mb-2 ${
                        isActive ? 'bg-primary text-primary-foreground' : 'bg-white/5'
                      }`}>
                        {isActive ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      </div>
                      <span className="text-xs font-medium text-center capitalize">{mod.replace('_', ' ')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
