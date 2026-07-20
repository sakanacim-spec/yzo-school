import Link from "next/link";
import { ThreeLayerArchitecture } from "../components/home/ThreeLayerArchitecture";
import { WhyOziowComparison } from "../components/home/WhyOziowComparison";
import { CustomerLifecycle } from "../components/home/CustomerLifecycle";
import { SAAS_REGISTRY } from "../config/saas-registry";

export default function HomePage() {
  return (
    <>
      {/* HERO SECTION — 30-SECOND EXPLAINER */}
      <section className="relative overflow-hidden pt-32 pb-20 lg:pt-44 lg:pb-28 grid-pattern" aria-labelledby="hero-title">
        <div className="glow-indigo -top-40 -left-40 animate-pulse-glow" />
        <div className="glow-purple top-20 -right-20 animate-pulse-glow" style={{ animationDelay: "2s" }} />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-3.5 py-1.5 text-xs font-semibold text-indigo-300 mb-6 backdrop-blur-md">
            <span>⚡ La Plateforme SaaS Multi-Tenant &amp; Écosystème Métiers</span>
          </div>

          <h1 id="hero-title" className="section-title">
            Le Moteur SaaS qui propulse <br className="hidden sm:inline" />
            vos <span className="gradient-text">Applications Métiers</span>
          </h1>

          <p className="section-subtitle mx-auto mt-6">
            OZIOW est la seule plateforme qui combine un <strong className="text-white">Moteur Core sécurisé</strong> (Multi-Tenant RLS, IA Concierge Vectorielle, Billing) et une <strong className="text-white">Marketplace de Solutions Métiers</strong> prêtes à l&apos;emploi.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/marketplace" className="btn-primary w-full sm:w-auto text-base">
              Explorer la Marketplace SaaS
            </Link>
            <Link href="/publishers" className="btn-secondary w-full sm:w-auto text-base">
              Publier votre SaaS (Éditeurs)
            </Link>
          </div>

          {/* Quick Metrics */}
          <div className="mt-16 grid grid-cols-2 gap-4 md:grid-cols-4 max-w-4xl mx-auto border-t border-white/10 pt-8">
            <div>
              <div className="text-3xl font-extrabold text-white">30s</div>
              <div className="text-xs text-slate-400">Pour comprendre OZIOW</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold text-indigo-400">100%</div>
              <div className="text-xs text-slate-400">Isolation PostgreSQL RLS</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold text-purple-400">3 Couches</div>
              <div className="text-xs text-slate-400">Plateforme ➔ SaaS ➔ Clients</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold text-emerald-400">99.99%</div>
              <div className="text-xs text-slate-400">Uptime SLA Garanti</div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY OZIOW — 30 SECONDS COMPARISON */}
      <WhyOziowComparison />

      {/* 3-LAYER ARCHITECTURE VISUALIZER */}
      <ThreeLayerArchitecture />

      {/* FEATURED SAAS PRODUCTS GRID */}
      <section className="section border-t border-white/5" aria-labelledby="featured-saas">
        <div className="text-center">
          <span className="section-label">Solutions Verticales</span>
          <h2 id="featured-saas" className="section-title mt-4">
            Catalogue de <span className="gradient-text">SaaS Métiers</span>
          </h2>
          <p className="section-subtitle mx-auto text-center">
            Des applications ultra-spécialisées prêtes à l&apos;emploi ou ouvertes à la personnalisation.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SAAS_REGISTRY.map((saas) => (
            <div key={saas.id} className="glass-card p-6 flex flex-col justify-between group">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-4xl">{saas.icon}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    saas.status === "live" ? "bg-emerald-500/15 text-emerald-400" : "bg-white/5 text-slate-500"
                  }`}>
                    {saas.status === "live" ? "✅ Disponible" : "🚀 En préparation"}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white group-hover:text-indigo-400 transition-colors">
                  {saas.name}
                </h3>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mt-1">{saas.category}</p>
                <p className="mt-3 text-sm text-slate-300 leading-relaxed">{saas.tagline}</p>
              </div>

              <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                <span className="text-xs text-slate-400">{saas.publisher}</span>
                <Link href={`/solutions/${saas.id}`} className="text-xs font-bold text-indigo-400 hover:text-indigo-300">
                  Découvrir →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CUSTOMER LIFECYCLE (9 STEPS) */}
      <CustomerLifecycle />

      {/* CTA SECTION */}
      <section className="relative overflow-hidden border-t border-white/5 py-20 grid-pattern">
        <div className="glow-indigo top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse-glow" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            Prêt à lancer votre SaaS Métier sur OZIOW ?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-400">
            Rejoignez l&apos;écosystème OZIOW en tant que client ou en tant qu&apos;éditeur partenaire.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link href="/marketplace" className="btn-primary">
              Consulter la Marketplace
            </Link>
            <Link href="/contact" className="btn-secondary">
              Nous Contacter
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
