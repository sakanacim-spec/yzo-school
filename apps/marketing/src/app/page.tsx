import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32 pb-20 lg:pt-48 lg:pb-32 grid-pattern" aria-labelledby="hero-title">
        <div className="glow-indigo -top-40 -left-40 animate-pulse-glow" />
        <div className="glow-purple top-20 -right-20 animate-pulse-glow" style={{ animationDelay: "2s" }} />
        
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <span className="section-label animate-float">OZIOW Core Platform v1.0</span>
          <h1 id="hero-title" className="section-title mt-8">
            Le système d&apos;exploitation de vos <span className="gradient-text">applications métiers</span>
          </h1>
          <p className="section-subtitle mx-auto mt-8">
            OZIOW est une plateforme SaaS modulaire qui combine intelligence artificielle, architecture multi-tenant et sécurité entreprise pour propulser vos solutions métiers.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/contact" className="btn-primary w-full sm:w-auto">
              Demander une démo
            </Link>
            <Link href="/solutions" className="btn-secondary w-full sm:w-auto">
              Découvrir les solutions
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y border-white/5 bg-white/5 backdrop-blur-md" aria-labelledby="stats-title">
        <h2 id="stats-title" className="sr-only">Chiffres clés</h2>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4 text-center">
            <div>
              <div className="text-4xl font-extrabold text-white">100%</div>
              <div className="mt-2 text-sm font-medium text-slate-400">Isolation des données (RLS)</div>
            </div>
            <div>
              <div className="text-4xl font-extrabold text-indigo-400">16+</div>
              <div className="mt-2 text-sm font-medium text-slate-400">Modules prêts à l&apos;emploi</div>
            </div>
            <div>
              <div className="text-4xl font-extrabold text-purple-400">GPT-4o</div>
              <div className="mt-2 text-sm font-medium text-slate-400">IA native intégrée</div>
            </div>
            <div>
              <div className="text-4xl font-extrabold text-emerald-400">99.9%</div>
              <div className="mt-2 text-sm font-medium text-slate-400">Disponibilité garantie</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="section" aria-labelledby="features-title">
        <div className="text-center">
          <span className="section-label">Pourquoi OZIOW ?</span>
          <h2 id="features-title" className="section-title mt-4">Une architecture <span className="gradient-text-warm">sans compromis</span></h2>
        </div>
        
        <div className="mt-20 grid gap-8 md:grid-cols-3">
          <div className="glass-card p-8">
            <div className="h-12 w-12 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-2xl mb-6">🏢</div>
            <h3 className="text-xl font-bold text-white">Multi-Tenant Natif</h3>
            <p className="mt-4 text-slate-400 leading-relaxed">
              Une architecture robuste permettant à des milliers d&apos;organisations de coexister sur la même instance avec une isolation parfaite grâce au Row-Level Security (RLS) de PostgreSQL.
            </p>
          </div>
          <div className="glass-card p-8">
            <div className="h-12 w-12 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center text-2xl mb-6">🤖</div>
            <h3 className="text-xl font-bold text-white">IA Vectorielle</h3>
            <p className="mt-4 text-slate-400 leading-relaxed">
              Transformez vos documents en base de connaissances intelligente. Notre IA Concierge utilise pgvector et OpenAI pour répondre précisément aux questions de vos utilisateurs.
            </p>
          </div>
          <div className="glass-card p-8">
            <div className="h-12 w-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl mb-6">🧩</div>
            <h3 className="text-xl font-bold text-white">Approche Modulaire</h3>
            <p className="mt-4 text-slate-400 leading-relaxed">
              Ne payez que pour ce que vous utilisez. Activez ou désactivez les modules (Paiements, Notifications, Fichiers, IA) d&apos;un simple clic selon les besoins de votre solution métier.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative overflow-hidden border-t border-white/5 py-24 sm:py-32 grid-pattern">
        <div className="glow-indigo top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse-glow" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Prêt à transformer votre secteur ?
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            Rejoignez OZIOW et déployez votre application métier sur-mesure avec une fraction du coût et du temps de développement habituels.
          </p>
          <div className="mt-10 flex justify-center gap-4">
            <Link href="/contact" className="btn-primary">
              Commencer maintenant
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
