"use client";

import { useState } from "react";
import { ShieldAlert, Activity, Filter, Download } from "lucide-react";

const mockAuditLogs = [
  { id: 1, created_at: new Date().toISOString(), action: 'superadmin.impersonation.started', actor_id: 'admin_123', target: 'tenant_99', severity: 'SECURITY' },
  { id: 2, created_at: new Date(Date.now() - 3600000).toISOString(), action: 'superadmin.kpis.refresh', actor_id: 'admin_456', target: 'global_kpis', severity: 'INFO' },
  { id: 3, created_at: new Date(Date.now() - 7200000).toISOString(), action: 'superadmin.impersonation.revoked', actor_id: 'admin_123', target: 'tenant_99', severity: 'SECURITY' },
  { id: 4, created_at: new Date(Date.now() - 86400000).toISOString(), action: 'tenant.plan.upgraded', actor_id: 'system', target: 'tenant_42', severity: 'INFO' },
];

export default function SecurityPage() {
  const [logs] = useState(mockAuditLogs);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
            Sécurité & Audit
          </h2>
          <p className="text-muted-foreground mt-1">
            Traçabilité globale et historique des actions sensibles (Impersonation, KPIs, etc).
          </p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium transition-all border border-white/10">
            <Filter className="w-4 h-4" /> Filtrer
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg text-sm font-medium transition-all hover-lift">
            <Download className="w-4 h-4" /> Exporter
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/20">
          <h3 className="font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Journaux d'Audit SaaS
          </h3>
          <span className="text-xs text-muted-foreground bg-black/40 px-3 py-1 rounded-full border border-white/5">
            100 derniers événements
          </span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-black/40 border-b border-white/5">
              <tr>
                <th className="px-6 py-4 font-medium">Date & Heure</th>
                <th className="px-6 py-4 font-medium">Action</th>
                <th className="px-6 py-4 font-medium">Acteur</th>
                <th className="px-6 py-4 font-medium">Cible</th>
                <th className="px-6 py-4 font-medium text-right">Sévérité</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap text-muted-foreground font-mono text-xs">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 font-medium">
                    <span className="bg-white/5 px-2 py-1 rounded-md text-primary/90 border border-white/5 group-hover:border-primary/30 transition-colors">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                    {log.actor_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-mono text-xs opacity-70">
                    {log.target}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                      log.severity === 'SECURITY' 
                        ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                        : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    }`}>
                      {log.severity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
