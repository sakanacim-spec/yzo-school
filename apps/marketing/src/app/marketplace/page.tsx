import Link from "next/link";
import type { Metadata } from "next";
import { SAAS_REGISTRY, MODULES_REGISTRY } from "../../config/saas-registry";

export const metadata: Metadata = {
  title: "Marketplace SaaS & Modules",
  description: "Explorez, testez et installez les SaaS Métiers et les modules d'extension de la plateforme OZIOW.",
};

export default function MarketplacePage() {
  return (
    <>
      <section className="relative overflow-hidden grid-pattern" aria-labelledby="marketplace-title">
        <div className="glow-indigo -top-40 left-1/3 animate-pulse-glow" />
        <div className="section text-center" style={{ paddingBottom: "3rem" }}>
          <span className="section-label">Écosystème Global</span>
          <h1 id="marketplace-title" className="section-title mt-4">
            La <span className="gradient-text">Marketplace</span> OZIOW
          </h1>
          <p className="section-subtitle mx-auto text-center">
            Un catalogue unifié de SaaS Métiers prêts à l&apos;emploi et de modules d&apos;extension fonctionnels pour personnaliser votre plateforme.
          </p>
        </div>
      </section>

      {/* SECTION 1 : SAAS MÉTIERS */}
      <section className="border-t border-white/5 py-12">
        <div className="section">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">🚀 SaaS Métiers (Solutions Verticales)</h2>
              <p className="text-sm text-slate-400">Applications complètes prêtes à être déployées pour chaque secteur.</p>
            </div>
            <Link href="/publishers" className="btn-secondary text-xs">
              + Publier votre SaaS
            </Link>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SAAS_REGISTRY.map((saas) => (
              <div key={saas.id} className="glass-card p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">{saas.icon}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      saas.status === "live" ? "bg-emerald-500/15 text-emerald-400" : "bg-white/5 text-slate-500"
                    }`}>
                      {saas.status === "live" ? "Disponible" : "Bientôt"}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">{saas.name}</h3>
                  <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mt-1">{saas.category}</p>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">{saas.description}</p>
                </div>

                <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                  <span className="text-xs text-slate-500">{saas.publisher}</span>
                  <Link href={`/solutions/${saas.id}`} className="btn-primary py-1.5 px-3 text-xs">
                    Tester / Gérer
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 2 : MODULES FONCTIONNELS */}
      <section className="border-t border-white/5 py-12 bg-white/5 backdrop-blur-sm">
        <div className="section">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white">🧩 Modules &amp; Extensions (Building Blocks)</h2>
            <p className="text-sm text-slate-400">Activez ou désactivez les briques techniques sur votre tenant.</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES_REGISTRY.map((mod) => (
              <div key={mod.id} className="glass-card p-6">
                <div className="flex items-center justify-between">
                  <span className="text-3xl">{mod.icon}</span>
                  <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
                    {mod.category}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-bold text-white">{mod.name}</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{mod.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {mod.keyBenefits.map((b) => (
                    <span key={b} className="text-[10px] rounded-md bg-white/5 px-2 py-1 text-slate-300">
                      ✓ {b}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 3 : PUBLISHER CALL TO ACTION */}
      <section className="border-t border-white/5 py-16">
        <div className="section">
          <div className="glass-card p-10 flex flex-col lg:flex-row items-center justify-between gap-8 border-indigo-500/30">
            <div>
              <span className="text-xs font-semibold text-indigo-400 uppercase tracking-widest">Programme Éditeurs</span>
              <h2 className="text-2xl font-extrabold text-white mt-2">Vous êtes un Éditeur de Logiciel ?</h2>
              <p className="mt-2 text-sm text-slate-400 max-w-xl">
                Publiez votre SaaS sur la Marketplace OZIOW et profitez de notre moteur Multi-Tenant RLS, IA Concierge et passerelle de paiement.
              </p>
            </div>
            <Link href="/publishers" className="btn-primary shrink-0">
              Devenir Éditeur Partenaire →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
