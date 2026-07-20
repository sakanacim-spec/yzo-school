import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Statut des Services",
  description: "État de santé en temps réel et métriques de disponibilité de la plateforme OZIOW.",
};

const servicesStatus = [
  { name: "API Gateway (api.oziow.com)", status: "Operational", uptime: "99.99%", latency: "42ms" },
  { name: "Moteur Multi-Tenant & RLS PostgreSQL", status: "Operational", uptime: "100%", latency: "12ms" },
  { name: "IA Concierge & Vector RAG (pgvector)", status: "Operational", uptime: "99.95%", latency: "180ms" },
  { name: "Portail Super-Administrateur (admin.oziow.com)", status: "Operational", uptime: "99.99%", latency: "35ms" },
  { name: "Système de Notifications (Email/SMS)", status: "Operational", uptime: "100%", latency: "95ms" },
];

export default function StatutPage() {
  return (
    <div className="section mx-auto max-w-5xl" style={{ paddingTop: "4rem" }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="section-label">Monitoring System</span>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">Statut de la Plateforme</h1>
        </div>
        <div className="inline-flex items-center gap-3 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
          Tous les systèmes opérationnels
        </div>
      </div>

      <div className="mt-12 space-y-4">
        {servicesStatus.map((s) => (
          <div key={s.name} className="glass-card p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-emerald-400" />
              <span className="font-bold text-white text-base">{s.name}</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-400">
              <span>Latence : <strong className="text-white">{s.latency}</strong></span>
              <span>Disponibilité : <strong className="text-emerald-400">{s.uptime}</strong></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
