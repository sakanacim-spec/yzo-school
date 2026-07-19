import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Marketplace",
  description: "Explorez le catalogue de modules OZIOW : IA Concierge, Knowledge Base, Paiements, API Gateway et plus.",
};

const modules = [
  { icon: "🤖", name: "IA Concierge", description: "Assistant intelligent alimenté par OpenAI pour répondre aux questions en langage naturel.", status: "live" as const, category: "Intelligence Artificielle" },
  { icon: "📚", name: "Knowledge Base", description: "Base de connaissances vectorielle avec import PDF, embeddings automatiques et recherche sémantique.", status: "live" as const, category: "Intelligence Artificielle" },
  { icon: "🔑", name: "Authentification", description: "Système d'authentification complet avec JWT, refresh tokens, inscription et réinitialisation.", status: "live" as const, category: "Sécurité" },
  { icon: "👥", name: "Gestion des Rôles", description: "RBAC granulaire avec rôles personnalisés, permissions par module et hiérarchie.", status: "live" as const, category: "Sécurité" },
  { icon: "🔌", name: "API Gateway", description: "API RESTful versionnée avec Swagger, rate limiting, clés API et documentation.", status: "live" as const, category: "Infrastructure" },
  { icon: "📋", name: "Audit Logs", description: "Journal d'audit complet avec traçabilité de toutes les actions et export.", status: "live" as const, category: "Conformité" },
  { icon: "📁", name: "Gestion de Fichiers", description: "Upload sécurisé de documents avec stockage cloud et accès contrôlé par tenant.", status: "live" as const, category: "Infrastructure" },
  { icon: "🔔", name: "Notifications", description: "Notifications multi-canal : email (Resend), SMS (Twilio), push notifications.", status: "live" as const, category: "Communication" },
  { icon: "💳", name: "Paiements", description: "Intégration Stripe pour les cartes et Paystack pour le Mobile Money.", status: "soon" as const, category: "Facturation" },
  { icon: "🧾", name: "Facturation", description: "Génération automatique de factures, gestion des abonnements et suivi.", status: "soon" as const, category: "Facturation" },
  { icon: "🤝", name: "Parrainage", description: "Programme de parrainage avec liens uniques et récompenses automatisées.", status: "soon" as const, category: "Croissance" },
  { icon: "📊", name: "Affiliation", description: "Système d'affiliation avec commissions multi-niveaux et reporting.", status: "soon" as const, category: "Croissance" },
  { icon: "🌍", name: "Multi-langues", description: "Internationalisation complète avec détection automatique de la langue.", status: "soon" as const, category: "Localisation" },
  { icon: "💱", name: "Multi-devises", description: "Support des devises internationales (€, $, FCFA) avec conversion.", status: "soon" as const, category: "Localisation" },
  { icon: "📈", name: "Analytics", description: "Tableaux de bord analytiques avec vues matérialisées et KPIs temps réel.", status: "live" as const, category: "Intelligence" },
  { icon: "🏢", name: "Multi-Organisations", description: "Architecture hiérarchique avec tenants, organisations et équipes.", status: "live" as const, category: "Infrastructure" },
];

const categories = [...new Set(modules.map((m) => m.category))];

export default function MarketplacePage() {
  return (
    <>
      <section className="relative overflow-hidden grid-pattern" aria-labelledby="marketplace-title">
        <div className="glow-indigo -top-40 left-1/3 animate-pulse-glow" />
        <div className="section text-center" style={{ paddingBottom: "4rem" }}>
          <span className="section-label">Catalogue de Modules</span>
          <h1 id="marketplace-title" className="section-title mt-6">La <span className="gradient-text">Marketplace</span> OZIOW</h1>
          <p className="section-subtitle mx-auto text-center">Activez uniquement les modules dont vous avez besoin. Chaque module fonctionne indépendamment ou en synergie.</p>
        </div>
      </section>

      {categories.map((cat) => (
        <section key={cat} className="border-t border-white/5">
          <div className="section" style={{ paddingTop: "3rem", paddingBottom: "3rem" }}>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-6">{cat}</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {modules.filter((m) => m.category === cat).map((mod) => (
                <div key={mod.name} className="glass-card p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{mod.icon}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${mod.status === "live" ? "bg-emerald-500/15 text-emerald-400" : "bg-white/5 text-slate-500"}`}>
                      {mod.status === "live" ? "Disponible" : "Bientôt"}
                    </span>
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-white">{mod.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{mod.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
    </>
  );
}
